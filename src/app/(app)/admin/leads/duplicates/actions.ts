"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Unificación de leads duplicados (revisión manual). Ver §6.11 arquitectura.
//   * Detección por (empresa, phone_e164) vía RPC duplicate_lead_groups().
//   * Superviviente sugerido = mayor avance/venta (empate: última actividad).
//   * Unificación transaccional vía RPC merge_leads() (mueve satélites).
// ============================================================================

const MERGE_ROLES = ["admin", "manager"] as const;

export type DuplicateGroup = {
  phone_e164: string;
  lead_count: number;
};

export type GroupLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  assigned_to: string | null; // nombre del vendedor
  has_sale: boolean;
  has_quote: boolean;
  last_activity: string; // ISO
  created_at: string;
  score: number; // ranking de "avance/venta"
  suggested_survivor: boolean;
};

// Ranking de avance del lead para elegir superviviente.
const STATUS_RANK: Record<string, number> = {
  new: 1,
  contacted: 2,
  interested: 3,
  quoted: 4,
  evaluating: 5,
  accepted: 7,
  closed: 7,
  rejected: 0,
  not_interested: 0,
};

export async function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  await requireRole([...MERGE_ROLES]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_lead_groups");
  if (error || !data) return [];
  return data.map((g) => ({
    phone_e164: g.phone_e164,
    lead_count: Number(g.lead_count),
  }));
}

export async function getGroupLeads(phoneE164: string): Promise<GroupLead[]> {
  const profile = await requireRole([...MERGE_ROLES]);
  if (!profile.company_id) return [];
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, status, created_at, updated_at, last_contacted_at, assigned_user_id",
    )
    .eq("company_id", profile.company_id)
    .eq("phone_e164", phoneE164)
    .is("merged_into_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (!leads || leads.length === 0) return [];

  const ids = leads.map((l) => l.id);
  const vendorIds = Array.from(
    new Set(leads.map((l) => l.assigned_user_id).filter(Boolean)),
  ) as string[];

  const [{ data: sales }, { data: quotes }, { data: vendors }] =
    await Promise.all([
      supabase.from("sales").select("lead_id, status").in("lead_id", ids),
      supabase.from("quotes").select("lead_id").in("lead_id", ids),
      vendorIds.length
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", vendorIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const saleByLead = new Map<string, boolean>();
  for (const s of sales ?? []) {
    // Una venta "viva" (no rechazada) pesa más.
    if (s.status !== "rejected") saleByLead.set(s.lead_id, true);
  }
  const quoteLeads = new Set((quotes ?? []).map((q) => q.lead_id));
  const vendorName = new Map<string, string>();
  for (const v of vendors ?? []) {
    vendorName.set(v.id, fullName(v.first_name, v.last_name));
  }

  const enriched: GroupLead[] = leads.map((l) => {
    const hasSale = saleByLead.get(l.id) ?? false;
    const hasQuote = quoteLeads.has(l.id);
    const lastActivity = l.last_contacted_at ?? l.updated_at ?? l.created_at;
    const score =
      (hasSale ? 100 : 0) +
      (STATUS_RANK[l.status] ?? 0) * 10 +
      (hasQuote ? 5 : 0);
    return {
      id: l.id,
      name: fullName(l.first_name, l.last_name),
      email: l.email,
      phone: l.phone,
      status: l.status,
      assigned_to: l.assigned_user_id
        ? (vendorName.get(l.assigned_user_id) ?? "—")
        : null,
      has_sale: hasSale,
      has_quote: hasQuote,
      last_activity: lastActivity,
      created_at: l.created_at,
      score,
      suggested_survivor: false,
    };
  });

  // Superviviente sugerido: mayor score; empate → última actividad más reciente.
  let best = enriched[0];
  for (const l of enriched) {
    if (
      l.score > best.score ||
      (l.score === best.score &&
        new Date(l.last_activity) > new Date(best.last_activity))
    ) {
      best = l;
    }
  }
  best.suggested_survivor = true;

  return enriched;
}

export type MergeResult = { ok: true } | { ok: false; message: string };

export async function mergeLeads(
  survivorId: string,
  absorbedIds: string[],
  reason?: string,
): Promise<MergeResult> {
  await requireRole([...MERGE_ROLES]);
  if (!survivorId || absorbedIds.length === 0) {
    return { ok: false, message: "Elegí el lead que queda y al menos uno a unificar" };
  }
  if (absorbedIds.includes(survivorId)) {
    return { ok: false, message: "El lead que queda no puede estar entre los absorbidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_leads", {
    p_survivor: survivorId,
    p_absorbed: absorbedIds,
    p_reason: reason ?? undefined,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/leads/duplicates");
  revalidatePath("/manager/leads/duplicates");
  revalidatePath("/admin/leads");
  revalidatePath("/manager/leads");
  return { ok: true };
}

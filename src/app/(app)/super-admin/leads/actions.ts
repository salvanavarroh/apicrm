"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import type { CommercialLeadStatus } from "@/lib/commercial-leads";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

const VALID_STATUSES: CommercialLeadStatus[] = [
  "new",
  "contacted",
  "demo_scheduled",
  "demo_done",
  "won",
  "lost",
];

function revalidateLeadPaths(leadId?: string) {
  revalidatePath("/super-admin/leads");
  if (leadId) revalidatePath(`/super-admin/leads/${leadId}`);
}

export async function updateCommercialLeadStatus(
  leadId: string,
  status: CommercialLeadStatus,
): Promise<Result<{ leadId: string }>> {
  await requireRole(["super_admin"]);
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, message: "Estado inválido" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("commercial_leads")
    .update({ status })
    .eq("id", leadId);
  if (error) return { ok: false, message: error.message };
  revalidateLeadPaths(leadId);
  return { ok: true, leadId };
}

export async function deleteCommercialLead(
  leadId: string,
): Promise<Result<{ leadId: string }>> {
  await requireRole(["super_admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("commercial_leads")
    .delete()
    .eq("id", leadId);
  if (error) return { ok: false, message: error.message };
  revalidateLeadPaths();
  return { ok: true, leadId };
}

export async function addCommercialLeadNote(
  leadId: string,
  content: string,
): Promise<Result<{ noteId: string }>> {
  const profile = await requireRole(["super_admin"]);
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "La nota no puede estar vacía" };
  }
  if (trimmed.length > 5000) {
    return { ok: false, message: "Nota demasiado larga" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_lead_notes")
    .insert({
      commercial_lead_id: leadId,
      author_id: profile.id,
      content: trimmed,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }
  revalidateLeadPaths(leadId);
  return { ok: true, noteId: data.id };
}

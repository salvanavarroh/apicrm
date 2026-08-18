"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import type { InterestKind } from "@/lib/lead-interests";
import { createClient } from "@/lib/supabase/server";

// Server actions de los intereses del lead. Se usan tanto desde la ficha como
// desde el panel del inbox, así que viven en lib y no en la carpeta de una ruta.

const ROLES = ["admin", "manager", "supervisor", "sales"] as const;

type Result = { ok: true } | { ok: false; message: string };

export async function addLeadInterest(input: {
  leadId: string;
  kind: InterestKind;
  value: string;
  day?: number | null;
  month?: number | null;
}): Promise<Result> {
  const profile = await requireRole([...ROLES]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const value = input.value.trim();
  if (!value) return { ok: false, message: "Falta el dato" };

  if (input.kind === "cumpleanos" && (!input.day || !input.month)) {
    return { ok: false, message: "El cumpleaños necesita día y mes" };
  }

  const supabase = await createClient();
  // La RLS ya valida que el usuario pueda ver este lead: si no lo ve, el insert
  // falla por policy en vez de por un chequeo duplicado acá.
  const { error } = await supabase.from("lead_interests").insert({
    lead_id: input.leadId,
    company_id: profile.company_id,
    kind: input.kind,
    value,
    day: input.kind === "cumpleanos" ? (input.day ?? null) : null,
    month: input.kind === "cumpleanos" ? (input.month ?? null) : null,
    created_by: profile.id,
  });

  if (error) {
    // 23505 = unique violation: el mismo dato ya estaba cargado.
    if (error.code === "23505") {
      return { ok: false, message: "Ese dato ya estaba cargado" };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function removeLeadInterest(id: string): Promise<Result> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_interests")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/inbox");
  return { ok: true };
}

/** Lista los intereses de un lead. La usa el panel del inbox, que carga por
 *  server action en vez de por render del server. */
export async function listLeadInterests(leadId: string) {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_interests")
    .select("*")
    .eq("lead_id", leadId);
  return data ?? [];
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { maybeAdvanceStatus } from "@/lib/lead-status";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

const visitInputSchema = z.object({
  scheduled_at: z.string().min(1, "Fecha y hora obligatorias"), // ISO timestamp
  notes: z.string().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
});

export type VisitInput = z.input<typeof visitInputSchema>;

function revalidateVisitPaths(leadId: string) {
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/manager/leads/${leadId}`);
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/admin/tasks-visits");
  revalidatePath("/manager/tasks-visits");
  revalidatePath("/sales/tasks-visits");
  revalidatePath("/admin");
  revalidatePath("/manager");
  revalidatePath("/sales");
}

/**
 * Agenda una visita: usa branch_id del lead y, si no se especifica assigned_to,
 * el vendor asignado al lead.
 */
export async function scheduleVisit(
  leadId: string,
  raw: VisitInput,
): Promise<Result<{ visitId: string }>> {
  const profile = await requireRole(["admin", "manager", "sales"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = visitInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, branch_id, assigned_user_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "Lead no encontrado" };
  if (!lead.branch_id) {
    return {
      ok: false,
      message: "El lead no tiene sucursal asignada todavía",
    };
  }

  const assignedTo =
    parsed.data.assigned_to?.trim() ||
    lead.assigned_user_id ||
    profile.id;

  const { data, error } = await supabase
    .from("visits")
    .insert({
      lead_id: leadId,
      company_id: profile.company_id,
      branch_id: lead.branch_id,
      assigned_to: assignedTo,
      scheduled_at: parsed.data.scheduled_at,
      notes: parsed.data.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  // Agendar una visita / test drive denota interés (#7).
  await maybeAdvanceStatus(supabase, leadId, "interested");

  revalidateVisitPaths(leadId);
  return { ok: true, visitId: data.id };
}

export async function updateVisitStatus(
  visitId: string,
  status: "scheduled" | "completed" | "no_show" | "canceled",
): Promise<Result<{ visitId: string }>> {
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits")
    .update({ status })
    .eq("id", visitId)
    .select("lead_id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }
  revalidateVisitPaths(data.lead_id);
  return { ok: true, visitId };
}

export async function deleteVisit(
  visitId: string,
): Promise<Result<{ visitId: string }>> {
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("visits")
    .select("lead_id")
    .eq("id", visitId)
    .maybeSingle();
  const { error } = await supabase.from("visits").delete().eq("id", visitId);
  if (error) return { ok: false, message: error.message };
  if (existing) revalidateVisitPaths(existing.lead_id);
  return { ok: true, visitId };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

const approveSchema = z.object({
  scoring_check: z.literal(true, {
    error: () => ({ message: "Falta el check de scoring" }),
  }),
  scoring_comment: z.string().optional().or(z.literal("")),
  documentation_check: z.literal(true, {
    error: () => ({ message: "Falta el check de documentación" }),
  }),
  documentation_comment: z.string().optional().or(z.literal("")),
  payment_check: z.literal(true, {
    error: () => ({ message: "Falta el check de pago" }),
  }),
  payment_comment: z.string().optional().or(z.literal("")),
  general_comment: z.string().optional().or(z.literal("")),
});

export async function approveSale(
  saleId: string,
  raw: z.input<typeof approveSchema>,
): Promise<Result<{ saleId: string }>> {
  const profile = await requireRole(["admin"]);
  const parsed = approveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();

  // Buscar el vendor para snapshot de comisión actual.
  const { data: sale } = await supabase
    .from("sales")
    .select("id, vendor_id, status, lead_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { ok: false, message: "Venta no encontrada" };
  if (sale.status !== "evaluating") {
    return { ok: false, message: "Esta venta ya fue resuelta" };
  }

  let commission: number | null = null;
  if (sale.vendor_id) {
    const { data: vendor } = await supabase
      .from("profiles")
      .select("commission_percent")
      .eq("id", sale.vendor_id)
      .maybeSingle();
    commission = vendor?.commission_percent ?? null;
  }

  const { error } = await supabase
    .from("sales")
    .update({
      status: "accepted",
      scoring_check: true,
      scoring_comment: parsed.data.scoring_comment || null,
      documentation_check: true,
      documentation_comment: parsed.data.documentation_comment || null,
      payment_check: true,
      payment_comment: parsed.data.payment_comment || null,
      general_comment: parsed.data.general_comment || null,
      commission_percent_snapshot: commission,
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
    })
    .eq("id", saleId);

  if (error) return { ok: false, message: error.message };

  // El lead pasa a "Aprobado" cuando se aprueba la venta.
  await supabase
    .from("leads")
    .update({ status: "accepted" })
    .eq("id", sale.lead_id);

  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${sale.lead_id}`);
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${sale.lead_id}`);
  revalidatePath("/manager/leads");
  return { ok: true, saleId };
}

const rejectSchema = z.object({
  rejection_reason: z
    .string()
    .min(10, "El motivo debe tener al menos 10 caracteres"),
  scoring_check: z.boolean().optional(),
  scoring_comment: z.string().optional().or(z.literal("")),
  documentation_check: z.boolean().optional(),
  documentation_comment: z.string().optional().or(z.literal("")),
  payment_check: z.boolean().optional(),
  payment_comment: z.string().optional().or(z.literal("")),
});

export async function rejectSale(
  saleId: string,
  raw: z.input<typeof rejectSchema>,
): Promise<Result<{ saleId: string }>> {
  const profile = await requireRole(["admin"]);
  const parsed = rejectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, lead_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { ok: false, message: "Venta no encontrada" };
  if (sale.status !== "evaluating") {
    return { ok: false, message: "Esta venta ya fue resuelta" };
  }

  const { error } = await supabase
    .from("sales")
    .update({
      status: "rejected",
      scoring_check: parsed.data.scoring_check ?? false,
      scoring_comment: parsed.data.scoring_comment || null,
      documentation_check: parsed.data.documentation_check ?? false,
      documentation_comment: parsed.data.documentation_comment || null,
      payment_check: parsed.data.payment_check ?? false,
      payment_comment: parsed.data.payment_comment || null,
      rejection_reason: parsed.data.rejection_reason,
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
    })
    .eq("id", saleId);

  if (error) return { ok: false, message: error.message };

  // El lead pasa a "Rechazado" cuando se rechaza la venta.
  await supabase
    .from("leads")
    .update({ status: "rejected" })
    .eq("id", sale.lead_id);

  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${sale.lead_id}`);
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${sale.lead_id}`);
  revalidatePath("/manager/leads");
  return { ok: true, saleId };
}

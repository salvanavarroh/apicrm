"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { approverIdsForLead, notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

const initiateSchema = z.object({
  lead_id: z.string().uuid(),
  quote_id: z.string().uuid(),
});

// Vendedor inicia venta desde un lead presupuestado.
export async function initiateSale(
  raw: z.input<typeof initiateSchema>,
): Promise<Result<{ saleId: string }>> {
  const profile = await requireRole(["sales"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const parsed = initiateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, total, total_to_pay, lead_id, vendor_id")
    .eq("id", parsed.data.quote_id)
    .maybeSingle();
  if (!quote || quote.lead_id !== parsed.data.lead_id) {
    return { ok: false, message: "Cotización no encontrada" };
  }
  if (quote.vendor_id !== profile.id) {
    return { ok: false, message: "Esta cotización no es tuya" };
  }

  const { data: existing } = await supabase
    .from("sales")
    .select("id, status")
    .eq("lead_id", parsed.data.lead_id)
    .eq("vendor_id", profile.id)
    .eq("status", "evaluating")
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      message: "Ya hay una venta en evaluación para este lead",
    };
  }

  const { data: sale, error } = await supabase
    .from("sales")
    .insert({
      company_id: profile.company_id,
      lead_id: parsed.data.lead_id,
      quote_id: parsed.data.quote_id,
      vendor_id: profile.id,
      // final_price = lo que efectivamente paga el cliente (incluye intereses
      // si la modalidad era financed). Fallback al subtotal para cotizaciones
      // pre-Sprint12b sin total_to_pay calculado.
      final_price: quote.total_to_pay ?? quote.total,
    })
    .select("id")
    .single();
  if (error || !sale) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  // El lead pasa a "Evaluando" cuando se inicia la venta.
  await supabase
    .from("leads")
    .update({ status: "evaluating" })
    .eq("id", parsed.data.lead_id);

  await notifyApprovers(
    parsed.data.lead_id,
    profile.company_id,
    sale.id,
    `${fullName(profile.first_name, profile.last_name)} inició una venta para aprobar.`,
  );

  revalidateSalePaths(parsed.data.lead_id, sale.id);
  return { ok: true, saleId: sale.id };
}

// Reabre una venta RECHAZADA (misma fila) para volver a evaluación tras subir
// la documentación faltante. Conserva el historial en sale_reviews.
export async function resubmitSale(
  saleId: string,
): Promise<Result<{ saleId: string }>> {
  const profile = await requireRole(["sales"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, lead_id, vendor_id, company_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale || sale.vendor_id !== profile.id) {
    return { ok: false, message: "Venta no encontrada" };
  }
  if (sale.status !== "rejected") {
    return { ok: false, message: "Solo se pueden reenviar ventas rechazadas" };
  }

  // El vendedor no puede actualizar `sales` por RLS → usamos el admin client.
  // Reseteamos la resolución previa (queda registrada en sale_reviews).
  const admin = createAdminClient();
  const { error } = await admin
    .from("sales")
    .update({
      status: "evaluating",
      rejection_reason: null,
      resolved_at: null,
      resolved_by: null,
    })
    .eq("id", saleId);
  if (error) return { ok: false, message: error.message };

  await admin.from("leads").update({ status: "evaluating" }).eq("id", sale.lead_id);
  await admin.from("sale_reviews").insert({
    sale_id: saleId,
    company_id: sale.company_id,
    action: "resubmitted",
    reviewer_id: profile.id,
  });

  await notifyApprovers(
    sale.lead_id,
    sale.company_id,
    saleId,
    `${fullName(profile.first_name, profile.last_name)} reenvió una venta para aprobar.`,
    admin,
  );

  revalidateSalePaths(sale.lead_id, saleId);
  return { ok: true, saleId };
}

async function notifyApprovers(
  leadId: string,
  companyId: string,
  saleId: string,
  body: string,
  admin?: ReturnType<typeof createAdminClient>,
) {
  const client = admin ?? createAdminClient();
  const ids = await approverIdsForLead(leadId, client);
  if (ids.length === 0) return;
  await notify(
    ids.map((userId) => ({
      companyId,
      userId,
      category: "sales" as const,
      type: "sale_submitted",
      title: "Venta para aprobar",
      body,
      link: `/manager/sales/${saleId}`,
      entityType: "sale",
      entityId: saleId,
    })),
    client,
  );
}

function revalidateSalePaths(leadId: string, saleId: string) {
  for (const base of ["/admin", "/manager"]) {
    revalidatePath(`${base}/sales`);
    revalidatePath(`${base}/sales/${saleId}`);
    revalidatePath(`${base}/leads`);
    revalidatePath(base);
  }
  revalidatePath("/sales");
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${leadId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
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
    .select("id, total, lead_id, vendor_id")
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
      final_price: quote.total,
    })
    .select("id")
    .single();
  if (error || !sale) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  revalidatePath("/sales");
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${parsed.data.lead_id}`);
  revalidatePath("/admin/sales");
  return { ok: true, saleId: sale.id };
}

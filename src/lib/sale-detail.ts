// Carga el detalle de una venta (con joins) + su historial de revisiones.
// Server-only (recibe el cliente supabase; la RLS scopea por rol).

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SaleForView,
  SaleReview,
} from "@/components/sales/sale-detail-view";
import type { Database } from "@/types/database";

export async function loadSaleDetail(
  client: SupabaseClient<Database>,
  saleId: string,
): Promise<{ sale: SaleForView; reviews: SaleReview[] } | null> {
  const { data: sale } = await client
    .from("sales")
    .select(
      `
        id, status, final_price, started_at,
        scoring_check, scoring_comment,
        documentation_check, documentation_comment,
        payment_check, payment_comment,
        general_comment, rejection_reason, commission_percent_snapshot,
        vendor:profiles!vendor_id (first_name, last_name, commission_percent),
        lead:leads (first_name, last_name, vehicle_model),
        quote:quotes (id, modality)
      `,
    )
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return null;

  const { data: reviews } = await client
    .from("sale_reviews")
    .select(
      `id, action, reason, created_at,
       reviewer:profiles!reviewer_id (first_name, last_name)`,
    )
    .eq("sale_id", saleId)
    .order("created_at", { ascending: false });

  return {
    sale: sale as unknown as SaleForView,
    reviews: (reviews ?? []) as unknown as SaleReview[],
  };
}

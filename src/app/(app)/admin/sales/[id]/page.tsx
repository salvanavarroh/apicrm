import { notFound } from "next/navigation";

import { SaleDetailView } from "@/components/sales/sale-detail-view";
import { UsedCarTakeCard } from "@/components/used-prices/used-car-take-card";
import { getUsedCarTake } from "@/app/(app)/admin/valuations/actions";
import { requireRole } from "@/lib/auth";
import { loadSaleDetail } from "@/lib/sale-detail";
import { loadSaleDocs } from "@/lib/sale-docs";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const detail = await loadSaleDetail(supabase, id);
  if (!detail) notFound();
  const docs = await loadSaleDocs(supabase, id);
  // La toma del usado: cotizado vs pagado vs revendido.
  const take = detail.sale.lead_id
    ? await getUsedCarTake(id, detail.sale.lead_id)
    : null;

  return (
    <SaleDetailView
      sale={detail.sale}
      reviews={detail.reviews}
      docs={docs}
      companyId={profile.company_id!}
      backHref="/admin/sales"
      usedCarCard={take ? <UsedCarTakeCard saleId={id} take={take} /> : null}
    />
  );
}

import { notFound } from "next/navigation";

import { SaleDetailView } from "@/components/sales/sale-detail-view";
import { requireRole } from "@/lib/auth";
import { loadSaleDetail } from "@/lib/sale-detail";
import { loadSaleDocs } from "@/lib/sale-docs";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  const detail = await loadSaleDetail(supabase, id);
  if (!detail) notFound();
  const docs = await loadSaleDocs(supabase, id);

  return (
    <SaleDetailView
      sale={detail.sale}
      reviews={detail.reviews}
      docs={docs}
      companyId={profile.company_id!}
      backHref="/manager/sales"
    />
  );
}

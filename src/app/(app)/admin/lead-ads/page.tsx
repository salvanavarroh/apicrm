import { requireRole } from "@/lib/auth";
import {
  LeadAdsManager,
  type LeadAdFormRow,
} from "@/components/messaging/lead-ads-manager";
import { createClient } from "@/lib/supabase/server";

export default async function LeadAdsPage() {
  const profile = await requireRole(["admin", "manager"]);
  const supabase = await createClient();
  const companyId = profile.company_id!;

  const [{ data: forms }, { data: branches }, { data: productTypes }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("lead_ad_forms")
        .select("id, meta_form_id, form_name, branch_id, product_type_id, campaign_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("branches").select("id, name").eq("company_id", companyId).eq("status", "active"),
      supabase.from("product_types").select("id, name").eq("company_id", companyId).eq("status", "active"),
      supabase.from("campaigns").select("id, name").eq("company_id", companyId).eq("status", "active"),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Meta Lead Ads</h1>
        <p className="text-sm text-muted-foreground">
          Mapeá cada formulario de Lead Ads de Meta a una sucursal, tipo y
          campaña. Los leads entran solos por webhook, con la atribución de la
          campaña, y reemplazan el import manual de CSV.
        </p>
      </header>
      <LeadAdsManager
        forms={(forms ?? []) as LeadAdFormRow[]}
        branches={branches ?? []}
        productTypes={productTypes ?? []}
        campaigns={campaigns ?? []}
      />
    </div>
  );
}

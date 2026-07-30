import { requireRole } from "@/lib/auth";
import { IntegrationsView } from "@/components/integrations/integrations-view";
import type { Channel } from "@/components/integrations/connections-grid";
import type { LeadAdFormRow } from "@/components/messaging/lead-ads-manager";
import type {
  StandardTemplateView,
  WaChannel,
  WaTemplate,
} from "@/components/messaging/templates-manager";
import {
  STANDARD_TEMPLATES,
  variantForCountry,
} from "@/lib/messaging/standard-templates";
import { createClient } from "@/lib/supabase/server";

const TABS = new Set(["connections", "templates", "leadads"]);

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; connected?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const companyId = profile.company_id!;
  const supabase = await createClient();
  const sp = await searchParams;
  const initialTab = sp.tab && TABS.has(sp.tab) ? sp.tab : "connections";

  const [
    { data: channels },
    { data: templates },
    { data: company },
    { data: forms },
    { data: branches },
    { data: productTypes },
    { data: campaigns },
  ] = await Promise.all([
    supabase
      .from("messaging_channels")
      .select(
        "id, platform, external_ref, display_name, status, photo_url, quality_rating, messaging_limit_tier, name_status, metadata",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("whatsapp_templates")
      .select(
        "id, zernio_template_name, language, category, status, is_standard, body_preview, rejection_reason",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("country").eq("id", companyId).maybeSingle(),
    supabase
      .from("lead_ad_forms")
      .select("id, meta_form_id, form_name, branch_id, product_type_id, campaign_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("branches").select("id, name").eq("company_id", companyId).eq("status", "active"),
    supabase.from("product_types").select("id, name").eq("company_id", companyId).eq("status", "active"),
    supabase.from("campaigns").select("id, name").eq("company_id", companyId).eq("status", "active"),
  ]);

  const allChannels = (channels ?? []) as Channel[];
  // Los canales de WhatsApp activos alimentan el selector de plantillas.
  const waChannels: WaChannel[] = allChannels
    .filter((c) => c.platform === "whatsapp" && c.status === "active")
    .map((c) => ({ id: c.id, display_name: c.display_name, external_ref: c.external_ref }));

  const variant = variantForCountry(company?.country);
  const createdByName = new Map(
    ((templates ?? []) as WaTemplate[])
      .filter((t) => t.is_standard)
      .map((t) => [t.zernio_template_name, t.status]),
  );
  const standardSet: StandardTemplateView[] = STANDARD_TEMPLATES.map((t) => ({
    name: t.name,
    category: t.category,
    body: t.bodies[variant],
    status: createdByName.get(t.name) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Conectá y gestioná los canales de la concesionaria: WhatsApp,
          Instagram, Facebook y Meta Ads. Las conversaciones se atienden desde el
          Inbox.
        </p>
      </header>
      <IntegrationsView
        initialTab={initialTab}
        channels={allChannels}
        waChannels={waChannels}
        templates={(templates ?? []) as WaTemplate[]}
        standardSet={standardSet}
        forms={(forms ?? []) as LeadAdFormRow[]}
        branches={branches ?? []}
        productTypes={productTypes ?? []}
        campaigns={campaigns ?? []}
      />
    </div>
  );
}

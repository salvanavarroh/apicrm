"use server";

import { requireRole } from "@/lib/auth";
import { listAds, type ZernioAd } from "@/lib/messaging/zernio";
import { createClient } from "@/lib/supabase/server";

// Rendimiento por anuncio: métricas reales de Zernio (inversión, impresiones,
// clics, CTR, CPC, ROAS) cruzadas con el embudo real del CRM (leads → ventas →
// facturación) por `platformAdId` == `leads.metadata.adId`.

export type AdRow = {
  adId: string;
  platform: string;
  campaignName: string | null;
  adSetName: string | null;
  adName: string | null;
  status: string | null;
  currency: string;
  // Métricas de la plataforma (Zernio)
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
  // Embudo del CRM
  leads: number;
  contacted: number;
  sales: number;
  revenue: number;
  // Derivadas (CRM × inversión)
  costPerLead: number | null;
  costPerSale: number | null;
  realRoas: number | null;
};

export type AdsPerformance = {
  connected: boolean;
  rows: AdRow[];
  totals: {
    spend: number;
    leads: number;
    contacted: number;
    sales: number;
    revenue: number;
    impressions: number;
    clicks: number;
    costPerLead: number | null;
    costPerSale: number | null;
    realRoas: number | null;
  };
  range: { from: string; to: string };
};

type CrmAgg = { leads: number; contacted: number; sales: number; revenue: number };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getAdsPerformance(input?: {
  from?: string;
  to?: string;
  platform?: string;
}): Promise<AdsPerformance> {
  const profile = await requireRole(["admin", "manager"]);
  const companyId = profile.company_id!;
  const supabase = await createClient();

  const to = input?.to ?? ymd(new Date());
  const from = input?.from ?? ymd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const range = { from, to };

  // Cuentas de ads conectadas (Meta Ads; TikTok/Google cuando se conecten).
  const { data: adAccounts } = await supabase
    .from("messaging_channels")
    .select("zernio_account_id, platform")
    .eq("company_id", companyId)
    .eq("platform", "metaads")
    .eq("status", "active");

  const accounts = (adAccounts ?? []).filter((a) => a.zernio_account_id);
  if (accounts.length === 0) {
    return { connected: false, rows: [], totals: emptyTotals(), range };
  }

  // 1) Traer anuncios de Zernio (paginado, con tope de seguridad).
  const ads: ZernioAd[] = [];
  for (const acc of accounts) {
    try {
      const first = await listAds({
        accountId: acc.zernio_account_id,
        fromDate: from,
        toDate: to,
        platform: input?.platform || undefined,
        limit: 100,
        page: 1,
      });
      ads.push(...(first.ads ?? []));
      const pages = Math.min(first.pagination?.pages ?? 1, 5);
      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            listAds({
              accountId: acc.zernio_account_id,
              fromDate: from,
              toDate: to,
              platform: input?.platform || undefined,
              limit: 100,
              page: i + 2,
            }).catch(() => ({ ads: [] as ZernioAd[] })),
          ),
        );
        for (const r of rest) ads.push(...(r.ads ?? []));
      }
    } catch {
      /* si una cuenta falla, seguimos con lo que haya */
    }
  }

  // 2) Embudo del CRM por adId (leads del rango con atribución de anuncio).
  const { data: leads } = await supabase
    .from("leads")
    .select("id, status, metadata")
    .eq("company_id", companyId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .not("metadata->>adId", "is", null)
    .is("merged_into_id", null);

  const leadRows = (leads ?? []) as Array<{
    id: string;
    status: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  const leadIds = leadRows.map((l) => l.id);

  // Ventas aceptadas de esos leads → facturación por lead.
  const revenueByLead = new Map<string, number>();
  if (leadIds.length) {
    const { data: sales } = await supabase
      .from("sales")
      .select("lead_id, final_price, status")
      .eq("company_id", companyId)
      .eq("status", "accepted")
      .in("lead_id", leadIds);
    for (const s of sales ?? []) {
      revenueByLead.set(
        s.lead_id,
        (revenueByLead.get(s.lead_id) ?? 0) + Number(s.final_price ?? 0),
      );
    }
  }

  const crm = new Map<string, CrmAgg>();
  for (const l of leadRows) {
    const adId = String((l.metadata as { adId?: unknown })?.adId ?? "");
    if (!adId) continue;
    const agg = crm.get(adId) ?? { leads: 0, contacted: 0, sales: 0, revenue: 0 };
    agg.leads += 1;
    if (l.status && l.status !== "new") agg.contacted += 1;
    const rev = revenueByLead.get(l.id);
    if (rev !== undefined) {
      agg.sales += 1;
      agg.revenue += rev;
    }
    crm.set(adId, agg);
  }

  // 3) Merge: cada anuncio de Zernio + su embudo del CRM.
  const rows: AdRow[] = ads
    .filter((a) => a.platformAdId)
    .map((a) => {
      const m = a.metrics ?? {};
      const spend = num(m.spend);
      const agg = crm.get(a.platformAdId!) ?? {
        leads: 0,
        contacted: 0,
        sales: 0,
        revenue: 0,
      };
      return {
        adId: a.platformAdId!,
        platform: a.platform ?? "meta",
        campaignName: a.campaignName ?? null,
        adSetName: a.adSetName ?? null,
        adName: a.name ?? null,
        status: a.platformStatus ?? a.status ?? null,
        currency: a.currency ?? "ARS",
        spend,
        impressions: num(m.impressions),
        clicks: num(m.clicks),
        ctr: num(m.ctr),
        cpc: num(m.cpc),
        conversions: num(m.conversions),
        roas: num(m.roas),
        leads: agg.leads,
        contacted: agg.contacted,
        sales: agg.sales,
        revenue: agg.revenue,
        costPerLead: spend > 0 && agg.leads > 0 ? spend / agg.leads : null,
        costPerSale: spend > 0 && agg.sales > 0 ? spend / agg.sales : null,
        realRoas: spend > 0 ? agg.revenue / spend : null,
      };
    });

  // Orden por inversión desc, y los que tienen leads pero sin data de Zernio al final.
  rows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  const totals = rows.reduce(
    (t, r) => {
      t.spend += r.spend;
      t.leads += r.leads;
      t.contacted += r.contacted;
      t.sales += r.sales;
      t.revenue += r.revenue;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      return t;
    },
    { ...emptyTotals() },
  );
  totals.costPerLead = totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : null;
  totals.costPerSale = totals.spend > 0 && totals.sales > 0 ? totals.spend / totals.sales : null;
  totals.realRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;

  return { connected: true, rows, totals, range };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function emptyTotals(): AdsPerformance["totals"] {
  return {
    spend: 0,
    leads: 0,
    contacted: 0,
    sales: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    costPerLead: null,
    costPerSale: null,
    realRoas: null,
  };
}

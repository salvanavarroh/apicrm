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
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
  leads: number;
  contacted: number;
  interested: number;
  quoted: number;
  sales: number;
  revenue: number;
  costPerLead: number | null;
  costPerSale: number | null;
  realRoas: number | null;
};

export type Totals = {
  spend: number;
  leads: number;
  contacted: number;
  interested: number;
  quoted: number;
  sales: number;
  revenue: number;
  impressions: number;
  clicks: number;
  costPerLead: number | null;
  costPerSale: number | null;
  realRoas: number | null;
};

export type GroupRow = {
  key: string;
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
};

export type AdsPerformance = {
  connected: boolean;
  rows: AdRow[];
  totals: Totals;
  previous: { leads: number; sales: number; revenue: number };
  funnel: { leads: number; contacted: number; interested: number; quoted: number; sales: number };
  byPlatform: GroupRow[];
  byCampaign: GroupRow[];
  daily: { date: string; leads: number; sales: number }[];
  range: { from: string; to: string };
};

// Rango de avance del lead (para el embudo).
const STATUS_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  rejected: 1,
  not_interested: 1,
  interested: 2,
  quoted: 3,
  evaluating: 4,
  accepted: 5,
  closed: 5,
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Meta",
  instagram: "Meta",
  meta: "Meta",
  metaads: "Meta",
  tiktok: "TikTok",
  google: "Google",
};

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
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) /
        86400000,
    ) + 1,
  );
  const prevTo = ymd(new Date(new Date(`${from}T00:00:00`).getTime() - 86400000));
  const prevFrom = ymd(new Date(new Date(`${from}T00:00:00`).getTime() - days * 86400000));

  const { data: adAccounts } = await supabase
    .from("messaging_channels")
    .select("zernio_account_id, platform")
    .eq("company_id", companyId)
    .in("platform", ["metaads", "tiktok", "google"])
    .eq("status", "active");

  const accounts = (adAccounts ?? []).filter((a) => a.zernio_account_id);
  if (accounts.length === 0) {
    return {
      connected: false,
      rows: [],
      totals: emptyTotals(),
      previous: { leads: 0, sales: 0, revenue: 0 },
      funnel: { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0 },
      byPlatform: [],
      byCampaign: [],
      daily: [],
      range,
    };
  }

  // 1) Anuncios de Zernio (paginado, con tope).
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
      /* seguimos con lo que haya */
    }
  }

  // 2) Embudo del CRM (leads del rango con atribución de anuncio) + ventas.
  const { data: leads } = await supabase
    .from("leads")
    .select("id, status, metadata, created_at")
    .eq("company_id", companyId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .not("metadata->>adId", "is", null)
    .is("merged_into_id", null);

  const leadRows = (leads ?? []) as Array<{
    id: string;
    status: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  const leadIds = leadRows.map((l) => l.id);

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

  // Agregación por adId + embudo global + serie diaria.
  type CrmAgg = {
    leads: number;
    contacted: number;
    interested: number;
    quoted: number;
    sales: number;
    revenue: number;
  };
  const crm = new Map<string, CrmAgg>();
  const funnel = { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0 };
  const dailyMap = new Map<string, { leads: number; sales: number }>();
  for (let i = 0; i < days && i < 92; i++) {
    dailyMap.set(ymd(new Date(new Date(`${from}T00:00:00`).getTime() + i * 86400000)), {
      leads: 0,
      sales: 0,
    });
  }

  for (const l of leadRows) {
    const adId = String((l.metadata as { adId?: unknown })?.adId ?? "");
    const rank = STATUS_RANK[l.status ?? "new"] ?? 0;
    const isSale = revenueByLead.has(l.id);
    const rev = revenueByLead.get(l.id) ?? 0;

    // Embudo global
    funnel.leads += 1;
    if (rank >= 1) funnel.contacted += 1;
    if (rank >= 2) funnel.interested += 1;
    if (rank >= 3) funnel.quoted += 1;
    if (isSale) funnel.sales += 1;

    // Serie diaria
    const day = l.created_at.slice(0, 10);
    const d = dailyMap.get(day);
    if (d) {
      d.leads += 1;
      if (isSale) d.sales += 1;
    }

    if (!adId) continue;
    const agg =
      crm.get(adId) ??
      { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0, revenue: 0 };
    agg.leads += 1;
    if (rank >= 1) agg.contacted += 1;
    if (rank >= 2) agg.interested += 1;
    if (rank >= 3) agg.quoted += 1;
    if (isSale) {
      agg.sales += 1;
      agg.revenue += rev;
    }
    crm.set(adId, agg);
  }

  // 3) Merge anuncios + embudo.
  const rows: AdRow[] = ads
    .filter((a) => a.platformAdId)
    .map((a) => {
      const m = a.metrics ?? {};
      const spend = num(m.spend);
      const agg =
        crm.get(a.platformAdId!) ??
        { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0, revenue: 0 };
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
        interested: agg.interested,
        quoted: agg.quoted,
        sales: agg.sales,
        revenue: agg.revenue,
        costPerLead: spend > 0 && agg.leads > 0 ? spend / agg.leads : null,
        costPerSale: spend > 0 && agg.sales > 0 ? spend / agg.sales : null,
        realRoas: spend > 0 ? agg.revenue / spend : null,
      };
    });
  rows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // Totales.
  const totals = emptyTotals();
  for (const r of rows) {
    totals.spend += r.spend;
    totals.leads += r.leads;
    totals.contacted += r.contacted;
    totals.interested += r.interested;
    totals.quoted += r.quoted;
    totals.sales += r.sales;
    totals.revenue += r.revenue;
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
  }
  totals.costPerLead = totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : null;
  totals.costPerSale = totals.spend > 0 && totals.sales > 0 ? totals.spend / totals.sales : null;
  totals.realRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;

  // Agrupaciones para gráficos.
  const byPlatform = groupBy(rows, (r) => PLATFORM_LABEL[r.platform] ?? r.platform);
  const byCampaign = groupBy(rows, (r) => r.campaignName ?? "Sin campaña")
    .sort((a, b) => b.spend - a.spend || b.leads - a.leads)
    .slice(0, 8);

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Período anterior (solo CRM: barato) para los deltas de leads/ventas/facturación.
  const previous = { leads: 0, sales: 0, revenue: 0 };
  const { data: prevLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("company_id", companyId)
    .gte("created_at", `${prevFrom}T00:00:00`)
    .lte("created_at", `${prevTo}T23:59:59`)
    .not("metadata->>adId", "is", null)
    .is("merged_into_id", null);
  const prevIds = (prevLeads ?? []).map((l) => l.id);
  previous.leads = prevIds.length;
  if (prevIds.length) {
    const { data: prevSales } = await supabase
      .from("sales")
      .select("lead_id, final_price, status")
      .eq("company_id", companyId)
      .eq("status", "accepted")
      .in("lead_id", prevIds);
    const seen = new Set<string>();
    for (const s of prevSales ?? []) {
      if (!seen.has(s.lead_id)) {
        seen.add(s.lead_id);
        previous.sales += 1;
      }
      previous.revenue += Number(s.final_price ?? 0);
    }
  }

  return { connected: true, rows, totals, previous, funnel, byPlatform, byCampaign, daily, range };
}

function groupBy(rows: AdRow[], keyOf: (r: AdRow) => string): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = map.get(key) ?? { key, spend: 0, leads: 0, sales: 0, revenue: 0 };
    g.spend += r.spend;
    g.leads += r.leads;
    g.sales += r.sales;
    g.revenue += r.revenue;
    map.set(key, g);
  }
  return Array.from(map.values());
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function emptyTotals(): Totals {
  return {
    spend: 0,
    leads: 0,
    contacted: 0,
    interested: 0,
    quoted: 0,
    sales: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    costPerLead: null,
    costPerSale: null,
    realRoas: null,
  };
}

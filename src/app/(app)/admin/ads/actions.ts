"use server";

import { requireRole } from "@/lib/auth";
import { listAds, type ZernioAd } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

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
  metaLeads: number; // leads reportados por la plataforma (Meta actions.lead)
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
  metaLeads: number;
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

// Totales del período anterior (mismo largo, inmediatamente previo) para las
// comparaciones. Incluye inversión/clics reales de Zernio además del embudo CRM.
export type PreviousTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
  leads: number;
  sales: number;
  revenue: number;
  costPerLead: number | null;
  realRoas: number | null;
};

export type Funnel = {
  leads: number;
  contacted: number;
  interested: number;
  quoted: number;
  sales: number;
};

/**
 * Todo lo que el cliente NO puede recalcular solo cuando se filtra por
 * plataforma.
 *
 * Los KPIs, el donut y la tabla salen de `rows`, así que el cliente los
 * recalcula filtrando el array. Pero la serie diaria, el embudo, el heatmap y el
 * período anterior se arman a partir de los LEADS, y un lead no dice de qué
 * plataforma vino: hay que cruzarlo por `metadata.adId` contra la lista de
 * anuncios, y eso sólo se puede hacer acá. Por eso el server manda una rebanada
 * por plataforma, con los mismos nombres de campo que el objeto general: el
 * cliente elige una u otra y el resto del render no cambia.
 */
export type PlatformSlice = {
  previous: PreviousTotals;
  funnel: Funnel;
  daily: { date: string; leads: number; sales: number }[];
  leadsByHour: number[][];
  attribution: { attributed: number; total: number };
};

export type AdsPerformance = {
  connected: boolean;
  rows: AdRow[];
  totals: Totals;
  previous: PreviousTotals;
  funnel: Funnel;
  // Rebanada por plataforma ("Meta" | "Google" | "TikTok") para el filtro.
  platformSlices: Record<string, PlatformSlice>;
  byPlatform: GroupRow[];
  byCampaign: GroupRow[];
  daily: { date: string; leads: number; sales: number }[];
  // Cobertura de atribución: cuántos de los leads del período están atados a un
  // anuncio (metadata.adId) vs. el total. El resto (mayormente click-to-WhatsApp)
  // Zernio no lo reenvía con atribución.
  attribution: { attributed: number; total: number };
  // Cuántos anuncios se pudieron traer y si faltó alguno.
  quality: AdsFetchQuality;
  // Heatmap "cuándo entran los leads": 7 (lun→dom) × 24 (hora) en hora AR.
  leadsByHour: number[][];
  range: { from: string; to: string };
  generatedAt: string; // ISO — cuándo se trajo esta data (para "actualizado hace X")
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

/** Etiqueta visible de la plataforma. "Meta" agrupa facebook/instagram/metaads. */
function platformLabelOf(p: string): string {
  return PLATFORM_LABEL[p.toLowerCase()] ?? p;
}

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

  // Este informe es de la CONCESIONARIA COMPLETA, no del scope del usuario, y
  // por eso las consultas del CRM van con service_role acotadas a mano por
  // company_id.
  //
  // El motivo: la inversión sale de Zernio (cuenta de ads de toda la empresa) y
  // no se puede repartir por gerencia. Con el cliente RLS, un gerente veía la
  // plata de toda la empresa pero sólo los leads de SUS gerencias: costo por
  // lead, embudo, heatmap y serie diaria quedaban en cero o mal calculados, con
  // pinta de bug. Mezclar dos alcances en la misma tarjeta es peor que mostrar
  // el total: son conteos y plata agregados, sin datos personales de ningún
  // lead. El acceso a la pantalla lo sigue gobernando el requireRole de arriba.
  const supabase = createAdminClient();

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
      previous: emptyPrevious(),
      funnel: { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0 },
      platformSlices: {},
      byPlatform: [],
      byCampaign: [],
      daily: [],
      attribution: { attributed: 0, total: 0 },
      quality: { fetched: 0, truncated: false, failedPages: 0 },
      leadsByHour: emptyHeat(),
      range,
      generatedAt: new Date().toISOString(),
    };
  }

  // 1) Anuncios de Zernio del período (paginado, con tope).
  const { ads, quality } = await collectAds(accounts, from, to, input?.platform, MAX_PAGES);

  // adId → plataforma. Es lo que permite decir de qué plataforma vino un lead:
  // el lead sólo guarda `metadata.adId`, la plataforma la sabe el anuncio.
  const platformOfAd = new Map<string, string>();
  for (const a of ads) {
    if (a.platformAdId) {
      platformOfAd.set(a.platformAdId, platformLabelOf(a.platform ?? "meta"));
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

  // Todos los leads del período (con y sin atribución de ad) → cobertura de
  // atribución + heatmap de horarios de ingreso.
  const { data: allLeads } = await supabase
    .from("leads")
    .select("created_at")
    .eq("company_id", companyId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .is("merged_into_id", null)
    .is("archived_at", null);
  const leadsByHour = emptyHeat();
  for (const l of allLeads ?? []) {
    // Hora AR (UTC-3): desplazamos y leemos con métodos UTC.
    const d = new Date(new Date(l.created_at).getTime() - 3 * 3600 * 1000);
    const wd = (d.getUTCDay() + 6) % 7; // 0=lunes … 6=domingo
    leadsByHour[wd][d.getUTCHours()] += 1;
  }
  const attribution = {
    attributed: leadRows.length,
    total: (allLeads ?? []).length,
  };

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
  const dayKeys: string[] = [];
  const dailyMap = new Map<string, { leads: number; sales: number }>();
  for (let i = 0; i < days && i < 92; i++) {
    const key = ymd(new Date(new Date(`${from}T00:00:00`).getTime() + i * 86400000));
    dayKeys.push(key);
    dailyMap.set(key, { leads: 0, sales: 0 });
  }

  // Rebanadas por plataforma. Se crean a demanda (una concesionaria puede tener
  // sólo Meta) y arrancan con el mismo esqueleto de días que la serie general,
  // así el gráfico no cambia de forma al filtrar.
  const slices = new Map<
    string,
    {
      previous: PreviousTotals;
      funnel: Funnel;
      daily: Map<string, { leads: number; sales: number }>;
      leadsByHour: number[][];
      attributed: number;
    }
  >();
  function sliceOf(label: string) {
    let s = slices.get(label);
    if (!s) {
      s = {
        previous: emptyPrevious(),
        funnel: { leads: 0, contacted: 0, interested: 0, quoted: 0, sales: 0 },
        daily: new Map(dayKeys.map((d) => [d, { leads: 0, sales: 0 }])),
        leadsByHour: emptyHeat(),
        attributed: 0,
      };
      slices.set(label, s);
    }
    return s;
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

    // Mismo cálculo, pero acotado a la plataforma del anuncio que trajo el lead.
    // Si el anuncio no está en la lista del período (borrado, o fuera del tope
    // de páginas) no se puede saber la plataforma: cuenta en el general y no en
    // ninguna rebanada. Es preferible a repartirlo por adivinanza.
    const lab = platformOfAd.get(adId);
    if (lab) {
      const s = sliceOf(lab);
      s.funnel.leads += 1;
      if (rank >= 1) s.funnel.contacted += 1;
      if (rank >= 2) s.funnel.interested += 1;
      if (rank >= 3) s.funnel.quoted += 1;
      if (isSale) s.funnel.sales += 1;
      const sd = s.daily.get(day);
      if (sd) {
        sd.leads += 1;
        if (isSale) sd.sales += 1;
      }
      s.attributed += 1;
      // Heatmap: misma hora AR que la matriz general.
      const hd = new Date(new Date(l.created_at).getTime() - 3 * 3600 * 1000);
      s.leadsByHour[(hd.getUTCDay() + 6) % 7][hd.getUTCHours()] += 1;
    }

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
        metaLeads: metaLeadsOf(m),
        leads: agg.leads,
        contacted: agg.contacted,
        interested: agg.interested,
        quoted: agg.quoted,
        sales: agg.sales,
        revenue: agg.revenue,
        costPerLead: spend > 0 && metaLeadsOf(m) > 0 ? spend / metaLeadsOf(m) : null,
        costPerSale: spend > 0 && agg.sales > 0 ? spend / agg.sales : null,
        realRoas: spend > 0 ? agg.revenue / spend : null,
      };
    });
  rows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // Totales.
  const totals = emptyTotals();
  for (const r of rows) {
    totals.spend += r.spend;
    totals.metaLeads += r.metaLeads;
    totals.leads += r.leads;
    totals.contacted += r.contacted;
    totals.interested += r.interested;
    totals.quoted += r.quoted;
    totals.sales += r.sales;
    totals.revenue += r.revenue;
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
  }
  totals.costPerLead =
    totals.spend > 0 && totals.metaLeads > 0 ? totals.spend / totals.metaLeads : null;
  totals.costPerSale = totals.spend > 0 && totals.sales > 0 ? totals.spend / totals.sales : null;
  totals.realRoas = totals.spend > 0 ? totals.revenue / totals.spend : null;

  // Agrupaciones para gráficos.
  const byPlatform = groupBy(rows, (r) => platformLabelOf(r.platform));
  const byCampaign = groupBy(rows, (r) => r.campaignName ?? "Sin campaña")
    .sort((a, b) => b.spend - a.spend || b.leads - a.leads)
    .slice(0, 8);

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Período anterior (mismo largo) para comparaciones y deltas: inversión/clics
  // reales de Zernio + embudo CRM (leads/ventas/facturación).
  const previous: PreviousTotals = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    metaLeads: 0,
    leads: 0,
    sales: 0,
    revenue: 0,
    costPerLead: null,
    realRoas: null,
  };
  const { ads: prevAds } = await collectAds(
    accounts,
    prevFrom,
    prevTo,
    input?.platform,
    MAX_PAGES,
  );
  const prevPlatformOfAd = new Map<string, string>();
  for (const a of prevAds) {
    const m = a.metrics ?? {};
    previous.spend += num(m.spend);
    previous.impressions += num(m.impressions);
    previous.clicks += num(m.clicks);
    previous.metaLeads += metaLeadsOf(m);

    const lab = platformLabelOf(a.platform ?? "meta");
    if (a.platformAdId) prevPlatformOfAd.set(a.platformAdId, lab);
    // La comparación con el período anterior también tiene que respetar el
    // filtro: sin esto, al filtrar por Meta los deltas seguían midiendo contra
    // la inversión de las tres plataformas.
    const sp = sliceOf(lab).previous;
    sp.spend += num(m.spend);
    sp.impressions += num(m.impressions);
    sp.clicks += num(m.clicks);
    sp.metaLeads += metaLeadsOf(m);
  }
  const { data: prevLeads } = await supabase
    .from("leads")
    .select("id, metadata")
    .eq("company_id", companyId)
    .gte("created_at", `${prevFrom}T00:00:00`)
    .lte("created_at", `${prevTo}T23:59:59`)
    .not("metadata->>adId", "is", null)
    .is("merged_into_id", null);
  const prevRows = (prevLeads ?? []) as Array<{
    id: string;
    metadata: Record<string, unknown> | null;
  }>;
  const prevIds = prevRows.map((l) => l.id);
  previous.leads = prevIds.length;
  // Plataforma de cada lead del período anterior (para repartir ventas después).
  const prevPlatformOfLead = new Map<string, string>();
  for (const l of prevRows) {
    const adId = String((l.metadata as { adId?: unknown })?.adId ?? "");
    const lab = adId ? prevPlatformOfAd.get(adId) : undefined;
    if (!lab) continue;
    prevPlatformOfLead.set(l.id, lab);
    sliceOf(lab).previous.leads += 1;
  }
  if (prevIds.length) {
    const { data: prevSales } = await supabase
      .from("sales")
      .select("lead_id, final_price, status")
      .eq("company_id", companyId)
      .eq("status", "accepted")
      .in("lead_id", prevIds);
    const seen = new Set<string>();
    for (const s of prevSales ?? []) {
      const lab = prevPlatformOfLead.get(s.lead_id);
      if (!seen.has(s.lead_id)) {
        seen.add(s.lead_id);
        previous.sales += 1;
        if (lab) sliceOf(lab).previous.sales += 1;
      }
      previous.revenue += Number(s.final_price ?? 0);
      if (lab) sliceOf(lab).previous.revenue += Number(s.final_price ?? 0);
    }
  }
  previous.costPerLead =
    previous.spend > 0 && previous.metaLeads > 0 ? previous.spend / previous.metaLeads : null;
  previous.realRoas = previous.spend > 0 ? previous.revenue / previous.spend : null;

  // Cierre de las rebanadas: derivados y paso a la forma que consume el cliente.
  const platformSlices: Record<string, PlatformSlice> = {};
  for (const [label, s] of slices) {
    s.previous.costPerLead =
      s.previous.spend > 0 && s.previous.metaLeads > 0
        ? s.previous.spend / s.previous.metaLeads
        : null;
    s.previous.realRoas =
      s.previous.spend > 0 ? s.previous.revenue / s.previous.spend : null;
    platformSlices[label] = {
      previous: s.previous,
      funnel: s.funnel,
      daily: dayKeys.map((d) => ({ date: d, ...(s.daily.get(d) ?? { leads: 0, sales: 0 }) })),
      leadsByHour: s.leadsByHour,
      // `total` sigue siendo el total de leads del período (todos los canales):
      // la pregunta que responde el panel es "cuántos de los leads que entraron
      // los trajo esta plataforma", y para eso el denominador tiene que ser el
      // total real, no los de la plataforma.
      attribution: { attributed: s.attributed, total: (allLeads ?? []).length },
    };
  }

  return {
    connected: true,
    rows,
    totals,
    previous,
    funnel,
    platformSlices,
    byPlatform,
    byCampaign,
    daily,
    attribution,
    quality,
    leadsByHour,
    range,
    generatedAt: new Date().toISOString(),
  };
}

// Matriz 7×24 (lun→dom × hora) inicializada en 0.
function emptyHeat(): number[][] {
  return Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
}

/**
 * Techo de páginas por cuenta (100 anuncios por página).
 *
 * Antes era 5, y era la causa de que la atribución no funcionara: la cuenta de
 * Meta del piloto devuelve 9 páginas en 30 días, y los anuncios que realmente
 * traían los leads estaban en la página 7. Se descartaban en silencio, así que
 * ningún lead cruzaba con su anuncio: ventas 0, ROAS 0.00x y embudo vacío, con
 * la inversión igual de subestimada.
 *
 * Las páginas se piden en paralelo, así que subir el techo no multiplica la
 * espera. Si igual se topa, el informe lo dice en vez de mentir por lo bajo.
 */
const MAX_PAGES = 30;

export type AdsFetchQuality = {
  /** Anuncios efectivamente traídos. */
  fetched: number;
  /** Alguna cuenta tenía más páginas que el techo: faltan anuncios. */
  truncated: boolean;
  /** Páginas que Zernio no devolvió (timeout, rate limit). */
  failedPages: number;
};

type AdsFetch = { ads: ZernioAd[]; quality: AdsFetchQuality };

// Baja los anuncios de todas las cuentas conectadas para un rango (paginado, con
// tope de páginas). Reutilizado para el período actual y el anterior.
async function collectAds(
  accounts: { zernio_account_id: string | null }[],
  from: string,
  to: string,
  platform: string | undefined,
  maxPages: number,
): Promise<AdsFetch> {
  // Todas las cuentas en paralelo (antes era secuencial → era la causa real de la
  // demora al entrar al dashboard).
  const perAccount = await Promise.all(
    accounts.map(async (acc) => {
      const accountId = acc.zernio_account_id;
      if (!accountId) return { ads: [] as ZernioAd[], truncated: false, failed: 0 };
      const out: ZernioAd[] = [];
      let truncated = false;
      let failed = 0;
      try {
        const first = await listAds({
          accountId,
          fromDate: from,
          toDate: to,
          platform: platform || undefined,
          limit: 100,
          page: 1,
        });
        out.push(...(first.ads ?? []));
        const total = first.pagination?.pages ?? 1;
        truncated = total > maxPages;
        const pages = Math.min(total, maxPages);
        if (pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) =>
              listAds({
                accountId,
                fromDate: from,
                toDate: to,
                platform: platform || undefined,
                limit: 100,
                page: i + 2,
              }).catch(() => null),
            ),
          );
          for (const r of rest) {
            // Una página que falla es un agujero en la atribución, no un cero:
            // se cuenta para poder avisarlo.
            if (r === null) failed++;
            else out.push(...(r.ads ?? []));
          }
        }
      } catch {
        failed++;
      }
      return { ads: out, truncated, failed };
    }),
  );
  const ads = perAccount.flatMap((r) => r.ads);
  return {
    ads,
    quality: {
      fetched: ads.length,
      truncated: perAccount.some((r) => r.truncated),
      failedPages: perAccount.reduce((n, r) => n + r.failed, 0),
    },
  };
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
// Leads reportados por la plataforma. Meta los pone en metrics.actions.lead (o
// onsite_conversion.lead_grouped); metrics.conversions viene 0 en campañas de
// "Clientes potenciales" / click-to-WhatsApp, por eso NO alcanza con conversions.
function metaLeadsOf(m: import("@/lib/messaging/zernio").ZernioAdMetrics): number {
  const a = m.actions ?? {};
  return num(
    a["lead"] ??
      a["onsite_conversion.lead_grouped"] ??
      a["leadgen_grouped"] ??
      a["onsite_conversion.lead"] ??
      0,
  );
}
function emptyPrevious(): PreviousTotals {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    metaLeads: 0,
    leads: 0,
    sales: 0,
    revenue: 0,
    costPerLead: null,
    realRoas: null,
  };
}
function emptyTotals(): Totals {
  return {
    spend: 0,
    metaLeads: 0,
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

// ============================================================================
// Informe ejecutivo por concesionaria / gerencia.
//
// Es el reporte que pidió el cliente en la reunión: desempeño por vendedor,
// embudo, alertas de leads no gestionados y recomendaciones accionables.
//
// Dos decisiones de diseño importantes:
//
//  1) El scope lo pone la RLS. El loader usa el cliente del usuario (no el
//     admin/service_role), así que un gerente ve su gerencia y un admin toda la
//     empresa sin que este archivo tenga que saber la diferencia. Lo único que
//     se pasa explícito es `managerId` para acotar la lista de vendedores.
//
//  2) Las recomendaciones son REGLAS, no IA. Son deterministas, explicables y
//     no inventan descuentos ni promesas. Si más adelante se le suma un
//     resumen en lenguaje natural, va arriba de estas reglas, no en su lugar.
// ============================================================================

import {
  NO_CAMPAIGN_KEY,
  channelLabel,
  type CampaignOrigin,
} from "@/lib/campaign-origins";
import { fetchPaged } from "@/lib/leads-fetch";
import { fullName, type LeadStatus, type LeadTemperature } from "@/lib/leads";
import {
  businessHoursBetween,
  businessHoursLabel,
  businessHoursOf,
  type BusinessHours,
} from "@/lib/business-hours";
import { createClient } from "@/lib/supabase/server";

export type ReportRange = { from?: string | null; to?: string | null };

/** Estados vivos del pipeline pre-venta. */
const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

/** Estados que implican que alguien ya habló con el cliente. */
const CONTACTED_STATUSES: LeadStatus[] = ["contacted", "interested", "quoted"];

/** Estados que cuentan como venta cerrada del lado del lead. */
const WON_STATUSES: LeadStatus[] = ["accepted", "closed"];

const STALE_DAYS = 7;
const NEVER_CONTACTED_HOURS = 48;
const UNASSIGNED_ALERT_HOURS = 24;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type VendorPerformance = {
  id: string;
  name: string;
  active: boolean;
  /** Leads asignados a este vendedor dentro del período. */
  leads: number;
  contacted: number;
  quoted: number;
  won: number;
  salesAccepted: number;
  revenue: number;
  /** salesAccepted / leads (0..1). */
  conversion: number;
  /** Leads activos suyos sin cambio de estado hace +7 días. */
  stale: number;
  /** Asignados hace +48h que nunca registraron contacto. */
  neverContacted: number;
  /**
   * Horas HÁBILES (mediana) entre la asignación y el primer contacto. Mediana y
   * no promedio: un caso de 300 h no puede mover la métrica del equipo entero.
   */
  firstResponseHours: number | null;
  /** Sobre cuántos leads se calculó. Sin esto el número engaña. */
  firstResponseSample: number;
};

export type FunnelStep = {
  status: LeadStatus;
  label: string;
  count: number;
  /** Proporción sobre el total de leads del período (0..1). */
  share: number;
};

export type ChannelPerformance = {
  key: string;
  label: string;
  leads: number;
  share: number;
  won: number;
  conversion: number;
  /** Ventas aprobadas cuyo lead entró por este canal. */
  sales: number;
  /** Facturación de esas ventas. */
  revenue: number;
  /** Inversión publicitaria del canal en el período (null si no es pago). */
  spend: number | null;
  /** spend / leads. null cuando no hay inversión conocida. */
  costPerLead: number | null;
  /** spend / ventas. null cuando no hay inversión o no hubo ventas. */
  costPerSale: number | null;
};

export type ReportAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  count: number;
  href?: string;
};

export type Recommendation = {
  id: string;
  title: string;
  detail: string;
  /** Cómo de fuerte es la señal que la disparó. */
  impact: "high" | "medium" | "low";
};

export type ExecutiveReport = {
  range: ReportRange;
  /** true si se llegó al tope de filas y los desgloses son aproximados. */
  capped: boolean;
  totals: {
    leads: number;
    active: number;
    contacted: number;
    quoted: number;
    won: number;
    salesAccepted: number;
    revenue: number;
    avgTicket: number;
    conversion: number;
    stale: number;
    unassigned: number;
    noTemperature: number;
    firstResponseHours: number | null;
    firstResponseSample: number;
  };
  /** Horario de atención con el que se midió el primer contacto. */
  businessHours: string;
  vendors: VendorPerformance[];
  funnel: FunnelStep[];
  channels: ChannelPerformance[];
  temperature: { key: LeadTemperature | "none"; label: string; count: number }[];
  alerts: ReportAlert[];
  recommendations: Recommendation[];
};

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

type ReportLead = {
  id: string;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  assigned_user_id: string | null;
  assigned_at: string | null;
  campaign_id: string | null;
  created_at: string;
  status_changed_at: string;
  last_contacted_at: string | null;
  last_managed_at: string;
};

type ReportNote = { lead_id: string; created_at: string };

const FUNNEL_LABELS: Record<string, string> = {
  new: "Nuevos",
  contacted: "Contactados",
  interested: "Interesados",
  quoted: "Presupuestados",
  evaluating: "En evaluación",
  accepted: "Aprobados",
  closed: "Cerrados",
  rejected: "Rechazados",
  not_interested: "No interesados",
};

const TEMPERATURE_LABELS: Record<LeadTemperature | "none", string> = {
  hot: "🔥 Caliente",
  warm: "🟡 Tibio",
  cold: "🔵 Frío",
  none: "Sin calificar",
};


/**
 * Inversión publicitaria por canal, para poder calcular costo por lead.
 *
 * El gasto no está en el CRM: vive en las plataformas y lo trae el módulo de
 * Rendimiento de Ads. Se consulta de forma TOLERANTE A FALLOS: si la cuenta no
 * está conectada, la API de la plataforma falla o tarda, el informe se muestra
 * igual con `spend: null` y las columnas de costo en "—". Un informe sin costo
 * por lead sigue sirviendo; un informe que no carga, no.
 *
 * TOLERANTE A FALLOS INCLUYE TOLERANTE A LENTO. Era tolerante a errores pero
 * esperaba lo que hiciera falta, y con la cuenta del piloto eso son 24 pedidos a
 * Zernio: medido, 68 segundos. La página quedaba en blanco todo ese tiempo y se
 * leía como "el informe ejecutivo no abre" — que es exactamente como lo reportó
 * el QA. Ahora hay un tope: si en 5 segundos no volvió, el informe sale sin la
 * inversión.
 */
const SPEND_TIMEOUT_MS = 5000;
async function loadSpendByChannel(
  range: ReportRange,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { getAdsPerformance } = await import(
      "@/app/(app)/admin/ads/actions"
    );
    const ads = await Promise.race([
      getAdsPerformance({
        from: range.from ?? undefined,
        to: range.to ?? undefined,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SPEND_TIMEOUT_MS),
      ),
    ]);
    // null = se agotó el tiempo. El informe sale sin costo por lead, que es
    // mejor que no salir.
    if (!ads || !ads.connected) return out;
    // El informe agrupa por origen de campaña; ads agrupa por plataforma.
    const PLATFORM_TO_ORIGIN: Record<string, string> = {
      Meta: "meta_ads",
      Google: "google_ads",
      TikTok: "tiktok_ads",
    };
    for (const row of ads.byPlatform) {
      const origin = PLATFORM_TO_ORIGIN[row.key];
      if (!origin) continue;
      out.set(origin, (out.get(origin) ?? 0) + row.spend);
    }
  } catch {
    // Silencioso a propósito: es un enriquecimiento, no un requisito.
  }
  return out;
}

export async function loadExecutiveReport(
  opts: { companyId: string; managerId?: string | null },
  range: ReportRange = {},
): Promise<ExecutiveReport> {
  const supabase = await createClient();
  const { companyId, managerId } = opts;

  const fromIso = range.from
    ? new Date(`${range.from}T00:00:00`).toISOString()
    : null;
  const toIso = range.to
    ? new Date(`${range.to}T23:59:59.999`).toISOString()
    : null;

  const now = Date.now();
  const staleCut = now - STALE_DAYS * DAY_MS;

  // Vendedores del alcance. Para un gerente/supervisor son los de su equipo;
  // para un admin, todos los de la concesionaria.
  let vendorQuery = supabase
    .from("profiles")
    .select("id, first_name, last_name, status")
    .eq("company_id", companyId)
    .eq("role", "sales")
    .neq("status", "deleted");
  if (managerId) vendorQuery = vendorQuery.eq("manager_id", managerId);

  const [
    { data: vendorRows },
    { data: campaignRows },
    { data: salesRows },
    spendByChannel,
    { data: companyRow },
  ] = await Promise.all([
      vendorQuery,
      supabase
        .from("campaigns")
        .select("id, origin")
        .eq("company_id", companyId),
      (() => {
        let q = supabase
          .from("sales")
          .select("id, status, final_price, vendor_id, started_at, lead_id")
          .eq("company_id", companyId);
        if (fromIso) q = q.gte("started_at", fromIso);
        if (toIso) q = q.lte("started_at", toIso);
        return q;
      })(),
      loadSpendByChannel(range),
      // El horario de atención: el primer contacto se mide en horas hábiles, no
      // de reloj. Es el mismo horario que usa el reparto del call center.
      supabase
        .from("companies")
        .select(
          "inbox_hours_enabled, inbox_hours_days, inbox_hours_start, inbox_hours_end, inbox_tz",
        )
        .eq("id", companyId)
        .maybeSingle(),
    ]);

  // Leads del período, en tandas (PostgREST corta en 1000).
  const { rows: leads, capped } = await fetchPaged<ReportLead>((withCount) => {
    let q = supabase
      .from("leads")
      .select(
        `id, status, temperature, assigned_user_id, assigned_at, campaign_id,
         created_at, status_changed_at, last_managed_at, last_contacted_at`,
        withCount ? { count: "exact" } : {},
      )
      .eq("company_id", companyId)
      .is("archived_at", null);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    return q.order("created_at", { ascending: false });
  });

  // Primer contacto registrado por lead: primera nota tipada (activity_type).
  // Se piden ascendentes, así la primera aparición de cada lead_id ES la primera.
  const { rows: notes } = await fetchPaged<ReportNote>((withCount) => {
    let q = supabase
      .from("lead_notes")
      .select("lead_id, created_at", withCount ? { count: "exact" } : {})
      .eq("company_id", companyId)
      .not("activity_type", "is", null);
    if (fromIso) q = q.gte("created_at", fromIso);
    return q.order("created_at", { ascending: true });
  });

  const firstNoteAt = new Map<string, number>();
  for (const n of notes) {
    if (!firstNoteAt.has(n.lead_id)) {
      firstNoteAt.set(n.lead_id, new Date(n.created_at).getTime());
    }
  }

  const vendors = vendorRows ?? [];
  const sales = salesRows ?? [];
  const acceptedSales = sales.filter((s) => s.status === "accepted");
  const campaignOrigin = new Map(
    (campaignRows ?? []).map((c) => [c.id, c.origin]),
  );

  const bh: BusinessHours = businessHoursOf(companyRow ?? {});

  // --- Totales -------------------------------------------------------------
  const isActive = (l: ReportLead) => ACTIVE_STATUSES.includes(l.status);
  const isStale = (l: ReportLead) =>
    isActive(l) && new Date(l.last_managed_at).getTime() < staleCut;

  const totalLeads = leads.length;
  const revenue = acceptedSales.reduce((a, s) => a + Number(s.final_price), 0);

  /** Horas entre asignación (o alta) y primer contacto registrado. */
  // Horas HÁBILES entre la asignación (o el alta) y el primer contacto: un lead
  // que entra el domingo empieza a contar el lunes a la hora de apertura.
  const responseHours = (l: ReportLead): number | null => {
    const first = firstNoteAt.get(l.id);
    if (!first) return null;
    const startIso = l.assigned_at ?? l.created_at;
    if (new Date(first).getTime() < new Date(startIso).getTime()) return null;
    return (
      Math.round(
        businessHoursBetween(startIso, new Date(first).toISOString(), bh) * 10,
      ) / 10
    );
  };

  /**
   * Mediana, no promedio. Con muestras chicas —siete leads contactados sobre
   * cuatro mil— tres casos de 300 h mandan sobre el número de toda la
   * concesionaria y el dato deja de significar nada.
   */
  const medianOf = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const v = [...values].sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    const med = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    return Math.round(med * 10) / 10;
  };

  const allResponses = leads
    .map(responseHours)
    .filter((v): v is number => v !== null);

  const totals = {
    leads: totalLeads,
    active: leads.filter(isActive).length,
    contacted: leads.filter((l) => CONTACTED_STATUSES.includes(l.status)).length,
    quoted: leads.filter((l) => l.status === "quoted").length,
    won: leads.filter((l) => WON_STATUSES.includes(l.status)).length,
    salesAccepted: acceptedSales.length,
    revenue,
    avgTicket: acceptedSales.length > 0 ? revenue / acceptedSales.length : 0,
    conversion: totalLeads > 0 ? acceptedSales.length / totalLeads : 0,
    stale: leads.filter(isStale).length,
    unassigned: leads.filter((l) => !l.assigned_user_id).length,
    noTemperature: leads.filter((l) => isActive(l) && !l.temperature).length,
    firstResponseHours: medianOf(allResponses),
    firstResponseSample: allResponses.length,
  };

  // --- Desempeño por vendedor ---------------------------------------------
  const vendorPerf: VendorPerformance[] = vendors
    .map((v) => {
      const mine = leads.filter((l) => l.assigned_user_id === v.id);
      const mySales = sales.filter((s) => s.vendor_id === v.id);
      const myAccepted = mySales.filter((s) => s.status === "accepted");
      const myRevenue = myAccepted.reduce(
        (a, s) => a + Number(s.final_price),
        0,
      );
      const responses = mine
        .map(responseHours)
        .filter((x): x is number => x !== null);

      return {
        id: v.id,
        name: fullName(v.first_name, v.last_name),
        active: v.status === "active",
        leads: mine.length,
        contacted: mine.filter((l) => CONTACTED_STATUSES.includes(l.status))
          .length,
        quoted: mine.filter((l) => l.status === "quoted").length,
        won: mine.filter((l) => WON_STATUSES.includes(l.status)).length,
        salesAccepted: myAccepted.length,
        revenue: myRevenue,
        conversion: mine.length > 0 ? myAccepted.length / mine.length : 0,
        stale: mine.filter(isStale).length,
        neverContacted: mine.filter(
          (l) =>
            isActive(l) &&
            !l.last_contacted_at &&
            new Date(l.assigned_at ?? l.created_at).getTime() <
              now - NEVER_CONTACTED_HOURS * HOUR_MS,
        ).length,
        firstResponseHours: medianOf(responses),
        firstResponseSample: responses.length,
      } satisfies VendorPerformance;
    })
    .sort((a, b) => b.salesAccepted - a.salesAccepted || b.leads - a.leads);

  // --- Embudo --------------------------------------------------------------
  const funnelOrder: LeadStatus[] = [
    "new",
    "contacted",
    "interested",
    "quoted",
    "accepted",
  ];
  const funnel: FunnelStep[] = funnelOrder.map((status) => {
    // El embudo es acumulativo: "llegó hasta acá o más allá".
    const reached = leads.filter((l) =>
      status === "new"
        ? true
        : status === "contacted"
          ? CONTACTED_STATUSES.includes(l.status) ||
            WON_STATUSES.includes(l.status) ||
            l.status === "evaluating"
          : status === "interested"
            ? ["interested", "quoted", "evaluating", ...WON_STATUSES].includes(
                l.status,
              )
            : status === "quoted"
              ? ["quoted", "evaluating", ...WON_STATUSES].includes(l.status)
              : WON_STATUSES.includes(l.status),
    ).length;
    return {
      status,
      label: FUNNEL_LABELS[status] ?? status,
      count: reached,
      share: totalLeads > 0 ? reached / totalLeads : 0,
    };
  });

  // --- Canales -------------------------------------------------------------
  const channelAgg = new Map<string, { leads: number; won: number }>();
  for (const l of leads) {
    const key = l.campaign_id
      ? (campaignOrigin.get(l.campaign_id) ?? NO_CAMPAIGN_KEY)
      : NO_CAMPAIGN_KEY;
    const cur = channelAgg.get(key) ?? { leads: 0, won: 0 };
    cur.leads += 1;
    if (WON_STATUSES.includes(l.status)) cur.won += 1;
    channelAgg.set(key, cur);
  }
  // Ventas por canal: se atribuye la venta al canal por el que entró SU lead.
  // Antes el informe decía cuántos leads traía cada canal pero no cuántas
  // ventas, que es la única pregunta que decide dónde poner el presupuesto.
  const leadChannel = new Map<string, string>();
  for (const l of leads) {
    leadChannel.set(
      l.id,
      l.campaign_id
        ? (campaignOrigin.get(l.campaign_id) ?? NO_CAMPAIGN_KEY)
        : NO_CAMPAIGN_KEY,
    );
  }
  const salesByChannel = new Map<string, { sales: number; revenue: number }>();
  for (const s of acceptedSales) {
    if (!s.lead_id) continue;
    const key = leadChannel.get(s.lead_id);
    // Venta de un lead fuera del rango del informe: no se le imputa a ningún
    // canal en vez de inventarle uno.
    if (!key) continue;
    const cur = salesByChannel.get(key) ?? { sales: 0, revenue: 0 };
    cur.sales += 1;
    cur.revenue += Number(s.final_price);
    salesByChannel.set(key, cur);
  }

  const channels: ChannelPerformance[] = [...channelAgg.entries()]
    .map(([key, agg]) => {
      const sold = salesByChannel.get(key) ?? { sales: 0, revenue: 0 };
      const spend = spendByChannel.get(key) ?? null;
      return {
        key,
        label: channelLabel(key),
        leads: agg.leads,
        share: totalLeads > 0 ? agg.leads / totalLeads : 0,
        won: agg.won,
        conversion: agg.leads > 0 ? agg.won / agg.leads : 0,
        sales: sold.sales,
        revenue: sold.revenue,
        spend,
        costPerLead: spend !== null && agg.leads > 0 ? spend / agg.leads : null,
        costPerSale:
          spend !== null && sold.sales > 0 ? spend / sold.sales : null,
      };
    })
    .sort((a, b) => b.leads - a.leads);

  // --- Temperatura ---------------------------------------------------------
  const tempKeys: (LeadTemperature | "none")[] = ["hot", "warm", "cold", "none"];
  const temperature = tempKeys.map((key) => ({
    key,
    label: TEMPERATURE_LABELS[key],
    count: leads.filter((l) =>
      key === "none" ? !l.temperature : l.temperature === key,
    ).length,
  }));

  // --- Alertas -------------------------------------------------------------
  const unassignedOld = leads.filter(
    (l) =>
      !l.assigned_user_id &&
      new Date(l.created_at).getTime() < now - UNASSIGNED_ALERT_HOURS * HOUR_MS,
  ).length;
  const neverContactedTotal = vendorPerf.reduce(
    (a, v) => a + v.neverContacted,
    0,
  );
  const idleVendors = vendorPerf.filter((v) => v.active && v.contacted === 0);

  const alerts: ReportAlert[] = [];
  if (unassignedOld > 0) {
    alerts.push({
      id: "unassigned",
      severity: "high",
      title: `${unassignedOld} lead(s) sin asignar hace más de ${UNASSIGNED_ALERT_HOURS}h`,
      detail:
        "Un lead sin dueño no se gestiona. Asignalo o activá la asignación automática en la gerencia.",
      count: unassignedOld,
    });
  }
  if (totals.stale > 0) {
    alerts.push({
      id: "stale",
      severity: "high",
      title: `${totals.stale} lead(s) activos sin gestión hace +${STALE_DAYS} días`,
      detail:
        "Están vivos en el pipeline pero nadie los movió. Son los primeros candidatos a recuperar o cerrar.",
      count: totals.stale,
    });
  }
  if (neverContactedTotal > 0) {
    alerts.push({
      id: "never-contacted",
      severity: "medium",
      title: `${neverContactedTotal} lead(s) asignados sin un solo contacto`,
      detail: `Asignados hace más de ${NEVER_CONTACTED_HOURS}h y todavía sin actividad registrada.`,
      count: neverContactedTotal,
    });
  }
  if (idleVendors.length > 0) {
    alerts.push({
      id: "idle-vendors",
      severity: "medium",
      title: `${idleVendors.length} vendedor(es) sin ningún contacto en el período`,
      detail: idleVendors.map((v) => v.name).join(", "),
      count: idleVendors.length,
    });
  }
  if (totals.noTemperature > 0) {
    alerts.push({
      id: "no-temperature",
      severity: "low",
      title: `${totals.noTemperature} lead(s) activos sin calificar`,
      detail:
        "Sin temperatura no hay forma de priorizar la agenda del día del vendedor.",
      count: totals.noTemperature,
    });
  }

  return {
    range,
    capped,
    businessHours: businessHoursLabel(bh),
    totals,
    vendors: vendorPerf,
    funnel,
    channels,
    temperature,
    alerts,
    recommendations: buildRecommendations({
      totals,
      vendors: vendorPerf,
      channels,
      funnel,
    }),
  };
}

// ---------------------------------------------------------------------------
// Recomendaciones accionables (reglas)
// ---------------------------------------------------------------------------

function buildRecommendations({
  totals,
  vendors,
  channels,
  funnel,
}: {
  totals: ExecutiveReport["totals"];
  vendors: VendorPerformance[];
  channels: ChannelPerformance[];
  funnel: FunnelStep[];
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const activeVendors = vendors.filter((v) => v.active);

  // 1. Carga desbalanceada entre vendedores.
  if (activeVendors.length >= 2) {
    const loads = [...activeVendors].sort((a, b) => b.leads - a.leads);
    const top = loads[0];
    const bottom = loads[loads.length - 1];
    if (top.leads >= 10 && top.leads >= bottom.leads * 2) {
      recs.push({
        id: "rebalance",
        impact: "high",
        title: `Rebalanceá la carga: ${top.name} tiene ${top.leads} leads y ${bottom.name} ${bottom.leads}`,
        detail:
          "Reasigná una tanda desde el listado de leads (selección múltiple → Reasignar) para que la atención no dependa de quién quedó saturado.",
      });
    }
  }

  // 2. Vendedores con muchos leads frenados.
  for (const v of activeVendors) {
    if (v.leads >= 5 && v.stale / v.leads >= 0.4) {
      recs.push({
        id: `stale-${v.id}`,
        impact: "high",
        title: `${v.name} tiene ${v.stale} de ${v.leads} leads sin gestión`,
        detail:
          "Revisá con el vendedor si es falta de tiempo o de interés real del cliente. Si es lo segundo, cerralos como 'No interesado' para que dejen de inflar el pipeline.",
      });
    }
  }

  // 3. Tiempo de primera respuesta muy por encima del promedio del equipo.
  if (totals.firstResponseHours !== null) {
    const slow = activeVendors.filter(
      (v) =>
        v.firstResponseHours !== null &&
        // Además de tener leads, tiene que tener MUESTRA: con un solo lead
        // contactado no se puede decir que alguien "tarda".
        v.leads >= 5 &&
        v.firstResponseSample >= 3 &&
        v.firstResponseHours > totals.firstResponseHours! * 2,
    );
    for (const v of slow) {
      recs.push({
        id: `slow-${v.id}`,
        impact: "medium",
        title: `${v.name} tarda ${v.firstResponseHours} h hábiles en el primer contacto (equipo: ${totals.firstResponseHours} h)`,
        detail:
          "El primer contacto rápido es lo que más mueve la conversión. Cargale una tarea automática al asignarle un lead nuevo.",
      });
    }
  }

  // 4. Canales: dónde invertir y dónde frenar.
  const meaningful = channels.filter((c) => c.leads >= 10);
  if (meaningful.length >= 2) {
    const best = [...meaningful].sort((a, b) => b.conversion - a.conversion)[0];
    const worst = [...meaningful].sort((a, b) => a.conversion - b.conversion)[0];
    if (best.conversion > 0 && best.conversion >= worst.conversion * 2) {
      recs.push({
        id: "channel-best",
        impact: "high",
        title: `${best.label} convierte ${pctLabel(best.conversion)} vs ${pctLabel(worst.conversion)} de ${worst.label}`,
        detail: `Mové presupuesto de ${worst.label} a ${best.label}, o revisá la calidad del lead que entra por ${worst.label} antes de seguir pagándolo.`,
      });
    }
    const dead = meaningful.filter((c) => c.won === 0 && c.leads >= 20);
    for (const c of dead) {
      recs.push({
        id: `channel-dead-${c.key}`,
        impact: "medium",
        title: `${c.label} trajo ${c.leads} leads y ninguna venta`,
        detail:
          "Antes de cortarlo, verificá que esos leads se estén gestionando: un canal 'malo' a veces es un canal sin seguimiento.",
      });
    }
  }

  // 5. Fuga entre etapas del embudo.
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1];
    const cur = funnel[i];
    if (prev.count >= 20 && cur.count / prev.count < 0.2) {
      recs.push({
        id: `funnel-${cur.status}`,
        impact: "medium",
        title: `Se cae el ${pctLabel(1 - cur.count / prev.count)} entre ${prev.label} y ${cur.label}`,
        detail:
          cur.status === "contacted"
            ? "La fuga está en el primer contacto: es un problema de velocidad y cantidad de intentos, no de precio."
            : cur.status === "quoted"
              ? "Muchos interesados sin presupuesto. Revisá si los vendedores están cotizando o esperando que el cliente pida."
              : "Revisá con el equipo qué objeción aparece en esta etapa y armá una plantilla de mensaje para responderla.",
      });
    }
  }

  // 6. Calificación de leads.
  if (totals.active >= 10 && totals.noTemperature / totals.active >= 0.4) {
    recs.push({
      id: "temperature",
      impact: "medium",
      title: `${pctLabel(totals.noTemperature / totals.active)} de los leads activos no tiene temperatura`,
      detail:
        "Pediles a los vendedores que califiquen al cerrar cada contacto. Sin eso, 'a quién llamo hoy' se decide por intuición.",
    });
  }

  // 7. Sin ventas en el período.
  if (totals.leads >= 20 && totals.salesAccepted === 0) {
    recs.push({
      id: "no-sales",
      impact: "high",
      title: `${totals.leads} leads en el período y ninguna venta aprobada`,
      detail:
        "Revisá si el problema es de gestión (leads sin contactar) o de registro (ventas cerradas que no se cargaron en el sistema).",
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return recs.sort((a, b) => order[a.impact] - order[b.impact]).slice(0, 8);
}

function pctLabel(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export type { CampaignOrigin };

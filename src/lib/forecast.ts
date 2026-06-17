import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { LeadStatus } from "@/lib/leads";

// ----------------------------------------------------------------------------
// Predicción de cierres — heurística determinística y explicable (sin ML).
//
// Idea: cada lead abierto tiene una probabilidad de cerrar = tasa de cierre
// histórica de la empresa × un multiplicador por etapa (un lead ya
// presupuestado vale mucho más que uno recién contactado). El monto proyectado
// = Σ (probabilidad × ticket promedio histórico).
//
// No requiere historial de transiciones: la tasa base sale de
// "ventas aceptadas / leads creados" en una ventana móvil.
// ----------------------------------------------------------------------------

// Cuánto más probable es cerrar según la etapa, relativo a la tasa base.
// Un lead en "quoted" cierra ~3× más que el promedio; uno "new" bastante menos.
export const FORECAST_STAGE_MULTIPLIER: Record<string, number> = {
  new: 0.4,
  contacted: 0.9,
  interested: 1.8,
  quoted: 3.0,
};

export const FORECAST_OPEN_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

const PROB_CAP = 0.95; // ningún lead abierto se da por cerrado al 100%.

export type ForecastInput = {
  openLeads: { status: LeadStatus }[];
  historicalLeadCount: number; // leads creados en la ventana
  acceptedPrices: number[]; // final_price de ventas aceptadas en la ventana
};

export type ForecastStageRow = {
  status: LeadStatus;
  count: number;
  prob: number;
  expectedCloses: number;
};

export type ForecastResult = {
  baseCloseRate: number; // 0..1
  avgTicket: number;
  expectedCloses: number; // Σ probabilidades (cantidad esperada)
  projectedRevenue: number; // Σ prob × ticket
  confidence: "low" | "medium" | "high";
  byStage: ForecastStageRow[];
  sampleSize: number; // ventas aceptadas usadas para calibrar
};

export function computeForecast(input: ForecastInput): ForecastResult {
  const { openLeads, historicalLeadCount, acceptedPrices } = input;
  const acceptedCount = acceptedPrices.length;

  const baseCloseRate =
    historicalLeadCount > 0
      ? Math.min(1, acceptedCount / historicalLeadCount)
      : 0;
  const avgTicket =
    acceptedCount > 0
      ? acceptedPrices.reduce((a, b) => a + b, 0) / acceptedCount
      : 0;

  const byStage: ForecastStageRow[] = FORECAST_OPEN_STATUSES.map((status) => {
    const count = openLeads.filter((l) => l.status === status).length;
    const prob = Math.min(
      PROB_CAP,
      baseCloseRate * (FORECAST_STAGE_MULTIPLIER[status] ?? 0),
    );
    return { status, count, prob, expectedCloses: count * prob };
  });

  const expectedCloses = byStage.reduce((a, s) => a + s.expectedCloses, 0);
  const projectedRevenue = expectedCloses * avgTicket;

  const confidence: ForecastResult["confidence"] =
    acceptedCount >= 20 ? "high" : acceptedCount >= 8 ? "medium" : "low";

  return {
    baseCloseRate,
    avgTicket,
    expectedCloses,
    projectedRevenue,
    confidence,
    byStage,
    sampleSize: acceptedCount,
  };
}

// ----------------------------------------------------------------------------
// Loader: corre las 3 queries necesarias contra el cliente (RLS-scoped, así
// que el admin ve toda la empresa y el manager solo sus gerencias).
// `vendorId` opcional para acotar a un vendedor.
// ----------------------------------------------------------------------------

type LeadStatusFilter = LeadStatus;

export async function loadForecast(
  supabase: SupabaseClient<Database>,
  opts: { companyId: string; vendorId?: string; windowDays?: number },
): Promise<ForecastResult> {
  const windowDays = opts.windowDays ?? 90;
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowIso = windowStart.toISOString();

  let openQuery = supabase
    .from("leads")
    .select("status")
    .eq("company_id", opts.companyId)
    .in("status", FORECAST_OPEN_STATUSES as LeadStatusFilter[]);
  if (opts.vendorId) openQuery = openQuery.eq("assigned_user_id", opts.vendorId);

  let histQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("company_id", opts.companyId)
    .gte("created_at", windowIso);
  if (opts.vendorId) histQuery = histQuery.eq("assigned_user_id", opts.vendorId);

  let salesQuery = supabase
    .from("sales")
    .select("final_price")
    .eq("company_id", opts.companyId)
    .eq("status", "accepted")
    .gte("started_at", windowIso);
  if (opts.vendorId) salesQuery = salesQuery.eq("vendor_id", opts.vendorId);

  const [openRes, histRes, salesRes] = await Promise.all([
    openQuery,
    histQuery,
    salesQuery,
  ]);

  return computeForecast({
    openLeads: (openRes.data ?? []) as { status: LeadStatus }[],
    historicalLeadCount: histRes.count ?? 0,
    acceptedPrices: (salesRes.data ?? []).map((s) => Number(s.final_price)),
  });
}

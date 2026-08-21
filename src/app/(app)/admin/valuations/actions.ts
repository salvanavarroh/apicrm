"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  guideNewPrice,
  guidePrice,
  latestAsOf,
  listGuideBrands,
  listGuideModels,
  listGuideVersions,
  listGuideYears,
  type GuideOption,
} from "@/lib/used-prices/lookup";
import {
  DEFAULT_SETTINGS,
  valuate,
  type Valuation,
  type ValuationSettings,
  type VehicleCondition,
} from "@/lib/used-prices/valuate";

// Cotizador de usados. Lo usan el inbox, la ficha del lead y la venta, así que
// las actions viven acá y las tres pantallas las importan.

const ROLES = ["admin", "manager", "supervisor", "sales"] as const;

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

// --- Opciones de la guía ----------------------------------------------------

export async function guideBrands(): Promise<GuideOption[]> {
  await requireRole([...ROLES]);
  return listGuideBrands();
}

export async function guideModels(brand: string): Promise<GuideOption[]> {
  await requireRole([...ROLES]);
  return listGuideModels(brand);
}

export async function guideVersions(
  brand: string,
  model: string,
): Promise<GuideOption[]> {
  await requireRole([...ROLES]);
  return listGuideVersions(brand, model);
}

export async function guideYears(
  brand: string,
  model: string,
  version: string,
): Promise<number[]> {
  await requireRole([...ROLES]);
  return listGuideYears(brand, model, version);
}

/** Fecha de la guía vigente, para mostrar de cuándo es el precio. */
export async function guideAsOf(): Promise<string | null> {
  await requireRole([...ROLES]);
  return latestAsOf();
}

// --- Parámetros de la concesionaria ----------------------------------------

async function loadSettings(companyId: string): Promise<ValuationSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("valuation_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    reconPercent: Number(data.recon_percent),
    marginPercent: Number(data.margin_percent),
    kmPerYear: data.km_per_year,
    kmPenaltyPer10k: Number(data.km_penalty_per_10k),
    kmBonusPer10k: Number(data.km_bonus_per_10k),
    kmAdjustCap: Number(data.km_adjust_cap),
    conditionAdjust: data.condition_adjust as ValuationSettings["conditionAdjust"],
    spreadPercent: Number(data.spread_percent),
  };
}

export type SettingsView = ValuationSettings & {
  usdRate: number | null;
  usdRateUpdatedAt: string | null;
};

export async function getValuationSettings(): Promise<SettingsView | null> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("valuation_settings")
    .select("*")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  const base = await loadSettings(profile.company_id);
  return {
    ...base,
    usdRate: data?.usd_rate != null ? Number(data.usd_rate) : null,
    usdRateUpdatedAt: data?.usd_rate_updated_at ?? null,
  };
}

export async function saveValuationSettings(input: {
  reconPercent: number;
  marginPercent: number;
  kmPerYear: number;
  kmPenaltyPer10k: number;
  kmBonusPer10k: number;
  kmAdjustCap: number;
  spreadPercent: number;
  conditionAdjust: Record<VehicleCondition, number>;
  usdRate: number | null;
}): Promise<Result> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("valuation_settings")
    .select("usd_rate")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  const { error } = await supabase.from("valuation_settings").upsert(
    {
      company_id: profile.company_id,
      recon_percent: input.reconPercent,
      margin_percent: input.marginPercent,
      km_per_year: input.kmPerYear,
      km_penalty_per_10k: input.kmPenaltyPer10k,
      km_bonus_per_10k: input.kmBonusPer10k,
      km_adjust_cap: input.kmAdjustCap,
      spread_percent: input.spreadPercent,
      condition_adjust: input.conditionAdjust,
      usd_rate: input.usdRate,
      // Sólo se pisa la fecha si el valor cambió: sirve para saber hace cuánto
      // que el dólar quedó viejo.
      usd_rate_updated_at:
        Number(prev?.usd_rate ?? 0) !== Number(input.usdRate ?? 0)
          ? new Date().toISOString()
          : undefined,
    },
    { onConflict: "company_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/valuations");
  return { ok: true };
}

// --- Cotizar ----------------------------------------------------------------

export type QuoteResult = Valuation & {
  brand: string;
  model: string;
  version: string;
  year: number;
  km: number;
  condition: VehicleCondition;
  currency: "ARS" | "USD";
  guideAsOf: string;
  /** Equivalente en pesos, sólo si el vehículo cotiza en USD y hay tipo de cambio. */
  arsEquivalent: number | null;
};

/**
 * Calcula la tasación. No guarda nada: el asesor todavía puede descartarla.
 */
export async function quoteUsedCar(input: {
  brand: string;
  model: string;
  version: string;
  year: number;
  km: number;
  condition: VehicleCondition;
}): Promise<Result<{ quote: QuoteResult }>> {
  const profile = await requireRole([...ROLES]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const price = await guidePrice({
    brand: input.brand,
    model: input.model,
    version: input.version,
    year: input.year,
  });
  if (!price) {
    return {
      ok: false,
      message: "La guía no tiene precio para esa versión y año",
    };
  }

  const settings = await loadSettings(profile.company_id);
  const newPrice = await guideNewPrice({
    brand: input.brand,
    model: input.model,
    version: input.version,
  });

  const result = valuate(
    {
      guideValue: price.value,
      year: input.year,
      km: input.km,
      condition: input.condition,
      // El año se pasa explícito: el motor es puro y no lee el reloj.
      currentYear: new Date().getFullYear(),
      newPrice: newPrice?.value ?? null,
    },
    settings,
  );

  // Conversión a pesos sólo si el vehículo cotiza en dólares Y el admin cargó un
  // tipo de cambio. Inventar uno es peor que no mostrarlo.
  let arsEquivalent: number | null = null;
  if (price.currency === "USD") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("valuation_settings")
      .select("usd_rate")
      .eq("company_id", profile.company_id)
      .maybeSingle();
    const rate = data?.usd_rate != null ? Number(data.usd_rate) : null;
    if (rate) arsEquivalent = Math.round(result.offerSuggested * rate);
  }

  return {
    ok: true,
    quote: {
      ...result,
      brand: input.brand,
      model: input.model,
      version: input.version,
      year: input.year,
      km: input.km,
      condition: input.condition,
      currency: price.currency,
      guideAsOf: price.asOf,
      arsEquivalent,
    },
  };
}

/**
 * Guarda la tasación. `offerSent` es lo que el asesor decidió ofrecer, que puede
 * diferir del sugerido: cotiza libre y queda registrado con su nombre.
 */
export async function saveValuation(input: {
  quote: QuoteResult;
  leadId?: string | null;
  conversationId?: string | null;
  offerSent?: number | null;
  markSent?: boolean;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  const profile = await requireRole([...ROLES]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const q = input.quote;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_valuations")
    .insert({
      company_id: profile.company_id,
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      brand: q.brand,
      model: q.model,
      version: q.version,
      year: q.year,
      km: q.km,
      condition: q.condition,
      guide_source: "acara",
      guide_as_of: q.guideAsOf,
      guide_currency: q.currency,
      guide_value: q.guideValue,
      // El desglose completo, para poder explicar el número seis meses después.
      breakdown: {
        steps: q.steps,
        warnings: q.warnings,
        marketValue: q.marketValue,
        offerMin: q.offerMin,
        offerMax: q.offerMax,
        offerSuggested: q.offerSuggested,
      },
      market_value: q.marketValue,
      offer_min: q.offerMin,
      offer_max: q.offerMax,
      offer_sent: input.offerSent ?? null,
      created_by: profile.id,
      sent_at: input.markSent ? new Date().toISOString() : null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "No se pudo guardar" };
  }

  if (input.leadId) {
    revalidatePath(`/admin/leads/${input.leadId}`);
    revalidatePath(`/manager/leads/${input.leadId}`);
    revalidatePath(`/sales/leads/${input.leadId}`);
  }
  return { ok: true, id: data.id };
}

export type LeadValuation = {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  km: number;
  condition: VehicleCondition;
  currency: "ARS" | "USD";
  marketValue: number;
  offerMin: number;
  offerMax: number;
  offerSent: number | null;
  guideAsOf: string;
  createdAt: string;
  sentAt: string | null;
  authorName: string | null;
};

/** Tasaciones de un lead, la más nueva primero. */
export async function listLeadValuations(
  leadId: string,
): Promise<LeadValuation[]> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("used_valuations")
    .select(
      `id, brand, model, version, year, km, condition, guide_currency,
       market_value, offer_min, offer_max, offer_sent, guide_as_of, created_at, sent_at,
       author:profiles!created_by (first_name, last_name)`,
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((v) => ({
    id: v.id,
    brand: v.brand,
    model: v.model,
    version: v.version,
    year: v.year,
    km: v.km,
    condition: v.condition as VehicleCondition,
    currency: v.guide_currency as "ARS" | "USD",
    marketValue: Number(v.market_value),
    offerMin: Number(v.offer_min),
    offerMax: Number(v.offer_max),
    offerSent: v.offer_sent != null ? Number(v.offer_sent) : null,
    guideAsOf: v.guide_as_of,
    createdAt: v.created_at,
    sentAt: v.sent_at,
    authorName: v.author
      ? `${v.author.first_name ?? ""} ${v.author.last_name ?? ""}`.trim() || null
      : null,
  }));
}

// --- La venta cierra el círculo ---------------------------------------------

/**
 * Registra lo que efectivamente se pagó por el usado (y, si ya pasó, a cuánto se
 * revendió).
 *
 * Es lo que convierte al historial propio en la mejor fuente de precios a
 * mediano plazo: cotizado → pagado → revendido. Sin este dato, el cotizador
 * nunca se entera de si está bien calibrado.
 */
export async function registerUsedCarTake(
  saleId: string,
  input: { paid: number | null; resold: number | null; valuationId?: string | null },
): Promise<Result> {
  const profile = await requireRole(["admin", "manager", "supervisor"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sales")
    .update({
      used_car_paid: input.paid,
      used_car_resold: input.resold,
      used_valuation_id: input.valuationId ?? undefined,
    })
    .eq("id", saleId)
    .eq("company_id", profile.company_id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath(`/manager/sales/${saleId}`);
  return { ok: true };
}

export type UsedCarTake = {
  paid: number | null;
  resold: number | null;
  /** Última tasación del lead, si hay: es el "cotizado" contra el que se compara. */
  quoted: LeadValuation | null;
};

export async function getUsedCarTake(
  saleId: string,
  leadId: string,
): Promise<UsedCarTake> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const [{ data: sale }, valuations] = await Promise.all([
    supabase
      .from("sales")
      .select("used_car_paid, used_car_resold")
      .eq("id", saleId)
      .maybeSingle(),
    listLeadValuations(leadId),
  ]);
  return {
    paid: sale?.used_car_paid != null ? Number(sale.used_car_paid) : null,
    resold: sale?.used_car_resold != null ? Number(sale.used_car_resold) : null,
    quoted: valuations[0] ?? null,
  };
}

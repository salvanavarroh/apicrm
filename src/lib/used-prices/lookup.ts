// ============================================================================
// Consulta de la guía de precios de usados.
//
// Lee de `used_price_guide`, que sincroniza el script mensual. No pega contra
// ACARA: cotizar tiene que ser instantáneo y tiene que seguir funcionando si la
// fuente se cae.
//
// Toda consulta se resuelve contra la guía MÁS RECIENTE (`as_of` máximo), pero
// devolviendo ese `as_of` para que la cotización lo pueda guardar. Sin eso, una
// cotización de hace dos meses no se puede reproducir.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type GuideOption = { value: string; label: string };

export type GuidePrice = {
  brand: string;
  model: string;
  version: string;
  /** null = 0km. */
  year: number | null;
  currency: "ARS" | "USD";
  value: number;
  /** Mes de la guía usada. Se guarda en la cotización. */
  asOf: string;
};

/**
 * Fecha de la guía vigente. Es lo que permite mostrar "según la guía de agosto"
 * y detectar que hace tres meses que no se sincroniza.
 */
export async function latestAsOf(): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("used_price_guide")
    .select("as_of")
    .eq("source", "acara")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.as_of ?? null;
}

export async function listGuideBrands(): Promise<GuideOption[]> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return [];
  // `brand` está en el índice de lookup, así que el distinct sale barato.
  const { data } = await db
    .from("used_price_guide")
    .select("brand")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .order("brand");
  return dedupe((data ?? []).map((r) => r.brand));
}

export async function listGuideModels(brand: string): Promise<GuideOption[]> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return [];
  const { data } = await db
    .from("used_price_guide")
    .select("model")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .eq("brand", brand)
    .order("model");
  return dedupe((data ?? []).map((r) => r.model));
}

export async function listGuideVersions(
  brand: string,
  model: string,
): Promise<GuideOption[]> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return [];
  const { data } = await db
    .from("used_price_guide")
    .select("version")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .eq("brand", brand)
    .eq("model", model)
    .order("version");
  return dedupe((data ?? []).map((r) => r.version));
}

/** Años con precio para esa versión, del más nuevo al más viejo. */
export async function listGuideYears(
  brand: string,
  model: string,
  version: string,
): Promise<number[]> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return [];
  const { data } = await db
    .from("used_price_guide")
    .select("year")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .eq("brand", brand)
    .eq("model", model)
    .eq("version", version)
    .not("year", "is", null)
    .order("year", { ascending: false });
  return [...new Set((data ?? []).map((r) => r.year as number))];
}

/** Precio de guía de una versión y año concretos. */
export async function guidePrice(input: {
  brand: string;
  model: string;
  version: string;
  year: number;
}): Promise<GuidePrice | null> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return null;
  const { data } = await db
    .from("used_price_guide")
    .select("brand, model, version, year, currency, value, as_of")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .eq("brand", input.brand)
    .eq("model", input.model)
    .eq("version", input.version)
    .eq("year", input.year)
    .maybeSingle();
  if (!data) return null;
  return {
    brand: data.brand,
    model: data.model,
    version: data.version,
    year: data.year,
    currency: data.currency as "ARS" | "USD",
    value: Number(data.value),
    asOf: data.as_of,
  };
}

/**
 * Precio del 0km de esa versión, si la guía lo trae.
 *
 * Sirve de techo: un usado no puede valer más que el 0km, y la relación entre
 * ambos es la forma más rápida de ver si un valor quedó viejo.
 */
export async function guideNewPrice(input: {
  brand: string;
  model: string;
  version: string;
}): Promise<GuidePrice | null> {
  const db = createAdminClient();
  const asOf = await latestAsOf();
  if (!asOf) return null;
  const { data } = await db
    .from("used_price_guide")
    .select("brand, model, version, year, currency, value, as_of")
    .eq("source", "acara")
    .eq("as_of", asOf)
    .eq("brand", input.brand)
    .eq("model", input.model)
    .eq("version", input.version)
    .is("year", null)
    .maybeSingle();
  if (!data) return null;
  return {
    brand: data.brand,
    model: data.model,
    version: data.version,
    year: null,
    currency: data.currency as "ARS" | "USD",
    value: Number(data.value),
    asOf: data.as_of,
  };
}

function dedupe(values: string[]): GuideOption[] {
  return [...new Set(values)].map((v) => ({ value: v, label: v }));
}

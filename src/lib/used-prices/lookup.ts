// ============================================================================
// Consulta de la guía de precios de usados.
//
// Lee de `used_price_guide`, que sincroniza el script mensual. No pega contra
// ACARA: cotizar tiene que ser instantáneo y tiene que seguir funcionando si la
// fuente se cae.
//
// Las listas de opciones salen de funciones SQL (`guide_brands`, `guide_models`,
// …) y no de un select con DISTINCT en el cliente. El motivo es concreto: la
// guía tiene ~15.000 filas, PostgREST corta en 1000, y el DISTINCT del cliente
// devolvía 3 marcas de 72. El mismo tope que ya nos había mordido en leads.
//
// Toda consulta se resuelve contra la guía MÁS RECIENTE, pero devolviendo su
// `as_of` para que la cotización lo pueda guardar: sin eso, una cotización de
// hace dos meses no se puede reproducir.
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
  const { data } = await db.rpc("guide_latest_as_of");
  return (data as string | null) ?? null;
}

function toOptions(rows: unknown): GuideOption[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (typeof r === "string" ? r : String(r)))
    .filter(Boolean)
    .map((v) => ({ value: v, label: v }));
}

export async function listGuideBrands(): Promise<GuideOption[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("guide_brands");
  return toOptions(data);
}

export async function listGuideModels(brand: string): Promise<GuideOption[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("guide_models", { p_brand: brand });
  return toOptions(data);
}

export async function listGuideVersions(
  brand: string,
  model: string,
): Promise<GuideOption[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("guide_versions", {
    p_brand: brand,
    p_model: model,
  });
  return toOptions(data);
}

/** Años con precio para esa versión, del más nuevo al más viejo. */
export async function listGuideYears(
  brand: string,
  model: string,
  version: string,
): Promise<number[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("guide_years", {
    p_brand: brand,
    p_model: model,
    p_version: version,
  });
  if (!Array.isArray(data)) return [];
  return data.map((y) => Number(y)).filter((y) => Number.isFinite(y));
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

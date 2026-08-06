// ============================================================================
// Núcleo (sin dependencias de server) de la carga de PRECIOS con IA: catálogo de
// campos destino, tipos del mapeo y la función pura que aplica un mapeo de
// columnas a las filas del archivo. Lo puede importar tanto el cliente (UI) como
// el server (actions). El mapper con IA vive aparte en price-mapper.ts porque usa
// OPENAI_API_KEY (server-only). Espejo de lead-import.ts / lead-mapper.ts.
// ============================================================================

export type PriceTargetKey =
  | "brand"
  | "model"
  | "version"
  | "model_year"
  | "currency"
  | "list_price"
  | "product_type"
  | "notes";

export type PriceTargetField = {
  key: PriceTargetKey;
  label: string;
  hint: string;
};

// Campos de una lista de precios de concesionaria.
export const PRICE_TARGET_FIELDS: PriceTargetField[] = [
  { key: "brand", label: "Marca", hint: "Marca del vehículo (ej. Toyota, Volkswagen, Renault)" },
  { key: "model", label: "Modelo", hint: "Modelo (ej. Corolla, Polo, Kangoo)" },
  { key: "version", label: "Versión", hint: "Versión/terminación (ej. XEi 2.0 CVT, Highline 1.6)" },
  { key: "model_year", label: "Año", hint: "Año del modelo (ej. 2026)" },
  { key: "currency", label: "Moneda", hint: "Moneda del precio: ARS o USD (por defecto ARS)" },
  { key: "list_price", label: "Precio de lista", hint: "Precio numérico (se limpian $ y separadores de miles)" },
  { key: "product_type", label: "Tipo de producto", hint: "Nombre del tipo (ej. 0 KM, Usados) — debe coincidir con un tipo activo" },
  { key: "notes", label: "Notas", hint: "Observaciones libres (stock, promo, vigencia, etc.)" },
];

// "ignore" = columna a descartar (vacía, separador, dato irrelevante).
export const PRICE_SPECIAL_TARGETS = ["ignore"] as const;

export const PRICE_TARGET_LABELS: Record<string, string> = {
  ...Object.fromEntries(PRICE_TARGET_FIELDS.map((f) => [f.key, f.label])),
  ignore: "Ignorar",
};

const KNOWN_TARGETS = new Set<string>([
  ...PRICE_TARGET_FIELDS.map((f) => f.key),
  ...PRICE_SPECIAL_TARGETS,
]);
export function isKnownPriceTarget(target: string): boolean {
  return KNOWN_TARGETS.has(target);
}

export type PriceColumnMapping = {
  source: string; // header tal cual viene en el archivo
  target: string; // key de PRICE_TARGET_FIELDS | "ignore"
  confidence: number; // 0..1
  note?: string;
};

export type PriceMapping = {
  columns: PriceColumnMapping[];
  notes?: string;
};

// Fila ya mapeada, con la MISMA forma que espera bulkImportPrices (PriceImportRow).
export type PriceRowData = {
  brand?: string;
  model?: string;
  version?: string;
  model_year?: string;
  currency?: string;
  list_price?: string;
  product_type_name?: string;
  notes?: string;
};

export type PriceMappedStatus = "ok" | "error";
export type PriceMappedRow = {
  index: number;
  status: PriceMappedStatus;
  data: PriceRowData;
  errors: string[];
};

export type PriceMappingStats = { total: number; ok: number; error: number };

export type PriceApplyResult = {
  rows: PriceMappedRow[];
  stats: PriceMappingStats;
};

// Aplica un mapeo de columnas a las filas crudas del archivo → filas de precio
// validadas (misma validación que bulkImportPrices: marca+modelo+precio numérico).
export function applyPriceMapping(
  rawRows: Record<string, string>[],
  mapping: PriceMapping,
): PriceApplyResult {
  // target → header de origen (el primero mapeado a ese campo).
  const sourceByTarget = new Map<string, string>();
  for (const col of mapping.columns) {
    if (!col?.source || col.target === "ignore") continue;
    if (!sourceByTarget.has(col.target)) sourceByTarget.set(col.target, col.source);
  }
  const val = (row: Record<string, string>, target: PriceTargetKey): string =>
    (sourceByTarget.get(target) ? row[sourceByTarget.get(target)!] : "")?.trim() ?? "";

  const rows: PriceMappedRow[] = rawRows.map((row, index) => {
    const data: PriceRowData = {
      brand: val(row, "brand"),
      model: val(row, "model"),
      version: val(row, "version"),
      model_year: val(row, "model_year"),
      currency: val(row, "currency") || "ARS",
      list_price: val(row, "list_price"),
      product_type_name: val(row, "product_type"),
      notes: val(row, "notes"),
    };
    const errors: string[] = [];
    if (!data.brand) errors.push("Falta la marca");
    if (!data.model) errors.push("Falta el modelo");
    const priceNum = Number(String(data.list_price ?? "").replace(/[^0-9.-]/g, ""));
    if (!data.list_price) errors.push("Falta el precio");
    else if (Number.isNaN(priceNum) || priceNum < 0) errors.push("Precio inválido");

    return { index, status: errors.length ? "error" : "ok", data, errors };
  });

  const stats: PriceMappingStats = {
    total: rows.length,
    ok: rows.filter((r) => r.status === "ok").length,
    error: rows.filter((r) => r.status === "error").length,
  };
  return { rows, stats };
}

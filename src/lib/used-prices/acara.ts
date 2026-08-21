// ============================================================================
// Cliente de la Guía Oficial de Precios de ACARA.
//
// Uso autorizado por ACARA (gestionado por el cliente, socio de la entidad).
//
// La guía se releva por mes, así que esto NO se llama cuando un vendedor cotiza:
// se sincroniza una vez al mes a `used_price_guide` y el cotizador lee de la base.
// Además de ser respetuoso con el servidor de ACARA, hace que cotizar sea
// instantáneo y que el CRM siga cotizando si ACARA se cae.
//
// ----------------------------------------------------------------------------
// Cómo está armada la fuente (relevado contra la API real)
// ----------------------------------------------------------------------------
//   GET /prices/brands-by-vehicule-type?vehiculeType=1        → JSON  [{id,name}]
//   GET /prices/model-list?vehiculeType=1&vehiculeBrandId=    → JSON  [{id,name}]
//   GET /prices/version-list?...&vehiculeModelId=             → JSON  [{id,name}]
//
// La tabla por marca devuelve NOMBRES, no ids, así que la identidad de una fila
// es (brandId, modelo, versión) con los strings exactos de la guía.
//   GET /prices/get-vehicules?vehiculeType=1&vehiculeBrandId= → HTML  (tabla)
//
// El truco que hace viable el sync: `get-vehicules` acepta SÓLO la marca y
// devuelve todas sus versiones en una tabla (Fiat: 268 filas). Así la guía
// entera son ~142 pedidos por mes en vez de decenas de miles, uno por versión.
//
// Dos detalles del formato que, mal leídos, dan números catastróficos:
//   · La moneda viene POR FILA: hay vehículos cotizados en dólares. Confundirla
//     no da un valor raro, da uno mil veces equivocado.
//   · Las columnas de año NO son fijas: hay que leer el <thead> de cada
//     respuesta en vez de asumir un rango.
// ============================================================================

const BASE = "https://api.acara.org.ar/api/v1";
/** 1 = autos. (2 motos, 3 camiones, 4 maquinaria agrícola.) */
export const VEHICLE_TYPE_AUTOS = 1;

export type AcaraItem = { id: number; name: string };

export type AcaraPriceRow = {
  brandId: number;
  brand: string;
  model: string;
  version: string;
  currency: "ARS" | "USD";
  /** null = 0km. */
  year: number | null;
  value: number;
};

async function request(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: {
      // Sin este header la API responde con un redirect a la home en vez de JSON.
      Accept: "application/json",
      "User-Agent": "API CRM (integracion autorizada ACARA)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ACARA ${path} → HTTP ${res.status}`);
  }
  return res;
}

export async function listBrands(
  vehicleType = VEHICLE_TYPE_AUTOS,
): Promise<AcaraItem[]> {
  const res = await request("/prices/brands-by-vehicule-type", {
    vehiculeType: vehicleType,
  });
  const json = (await res.json()) as { data?: AcaraItem[] };
  return json.data ?? [];
}

export async function listModels(
  brandId: number,
  vehicleType = VEHICLE_TYPE_AUTOS,
): Promise<AcaraItem[]> {
  const res = await request("/prices/model-list", {
    vehiculeType: vehicleType,
    vehiculeBrandId: brandId,
  });
  const json = (await res.json()) as { data?: AcaraItem[] };
  return json.data ?? [];
}

// --- Parseo de la tabla ------------------------------------------------------

/** "$" → ARS, "u$s" → USD. Cualquier otra cosa es un cambio de formato: se avisa. */
function parseCurrency(raw: string): "ARS" | "USD" | null {
  const t = raw.trim().toLowerCase();
  if (t === "$") return "ARS";
  if (t === "u$s" || t === "us$" || t === "u$d") return "USD";
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Convierte el valor de una celda a número.
 *
 * La API devuelve enteros limpios en pesos ("34010000"). El sitio viejo en PHP
 * devolvía "34.010,0" en MILES, que es una trampa distinta; si algún día esta
 * respuesta cambia de formato, este parser tiene que fallar en vez de adivinar,
 * porque un factor 1000 en una cotización lo paga el concesionario.
 */
function parseValue(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === "-" || t === "—") return null;
  if (!/^[\d.,]+$/.test(t)) return null;
  // Formato esperado: dígitos sin separadores.
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Formato con separadores: no se asume, se descarta y se cuenta como anomalía.
  return null;
}

export type ParsedTable = {
  rows: AcaraPriceRow[];
  /** Celdas que no se pudieron interpretar: si crece, cambió el formato. */
  skipped: number;
};

/**
 * Parsea la tabla HTML de `get-vehicules`.
 *
 * Columnas: Modelo | Version | Moneda | 0km | <año> | <año> | …
 * Los años se leen del encabezado, no se asumen.
 */
export function parsePriceTable(
  html: string,
  brand: { id: number; name: string },
): ParsedTable {
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1]),
  );
  // Las 3 primeras columnas son Modelo / Version / Moneda; el resto son períodos.
  const periods = headers.slice(3).map((h) => {
    const t = h.trim();
    if (/^0\s*km$/i.test(t)) return null; // 0km
    const y = Number(t);
    return Number.isInteger(y) ? y : undefined; // undefined = columna desconocida
  });

  const rows: AcaraPriceRow[] = [];
  let skipped = 0;

  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => stripTags(m[1]),
    );
    if (cells.length < 4) continue; // encabezado u otra cosa

    const [model, version, currencyRaw] = cells;
    const currency = parseCurrency(currencyRaw);
    if (!currency) {
      skipped++;
      continue;
    }

    if (!model || !version) {
      skipped++;
      continue;
    }

    for (let i = 3; i < cells.length; i++) {
      const period = periods[i - 3];
      if (period === undefined) {
        skipped++;
        continue;
      }
      const value = parseValue(cells[i]);
      if (value === null) continue; // "-" es normal: ese año no existió
      rows.push({
        brandId: brand.id,
        brand: brand.name,
        model,
        version,
        currency,
        year: period,
        value,
      });
    }
  }

  return { rows, skipped };
}

/** Tabla de precios de una marca completa: un pedido, todas sus versiones. */
export async function fetchBrandTable(brandId: number): Promise<string> {
  const res = await request("/prices/get-vehicules", {
    vehiculeType: VEHICLE_TYPE_AUTOS,
    vehiculeBrandId: brandId,
  });
  return res.text();
}

/** Versiones de un modelo (para resolver los ids que la tabla no trae). */
export async function listVersions(
  brandId: number,
  modelId: number,
): Promise<AcaraItem[]> {
  const res = await request("/prices/version-list", {
    vehiculeType: VEHICLE_TYPE_AUTOS,
    vehiculeBrandId: brandId,
    vehiculeModelId: modelId,
  });
  const json = (await res.json()) as { data?: AcaraItem[] };
  return json.data ?? [];
}

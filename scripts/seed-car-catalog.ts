/**
 * Seed/refresh del catálogo de autos (tabla car_catalog).
 *
 * Fuentes:
 *   - DNRPA (Argentina, oficial): inscripciones iniciales de autos.
 *     - Monthly CSV (último mes) → modelos vigentes.
 *     - Annual ZIPs (2018-actual) → cubre TODOS los modelos patentados en
 *       los últimos años, incluso discontinuados como Toyota Etios (último
 *       año en AR: 2021), Ford Ka, VW Suran, Fiat Palio, etc.
 *     Resuelve URLs via CKAN API.
 *   - global-car-models (MIT, fallback internacional): JSON con 94 marcas /
 *     ~1830 modelos. Cubre marcas premium/europeas/asiáticas que casi no
 *     aparecen en DNRPA (Aston Martin, Bugatti).
 *
 * Estrategia de normalización:
 *   - Marca: title case ("VOLKSWAGEN" → "Volkswagen"). Algunas marcas se
 *     remappean a mano (MERCEDES BENZ → Mercedes-Benz).
 *   - Modelo: primer "palabra" del DNRPA porque viene con todos los trims
 *     ("AMAROK COMFORTLINE TDI AT 4X2 G2" → "Amarok"). Hay un mapa de
 *     compuestos para preservar "Corolla Cross", "C3 Aircross", etc.
 *
 * Cómo correrlo:
 *   - Default (solo último mes + global): para refresh mensual
 *       pnpm tsx scripts/seed-car-catalog.ts
 *   - Histórico completo (2018-actual, cubre discontinuados):
 *       pnpm tsx scripts/seed-car-catalog.ts --full
 *   - Años custom:
 *       pnpm tsx scripts/seed-car-catalog.ts --years 2021,2022,2026
 */

import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const CKAN_API =
  "https://datos.jus.gob.ar/api/3/action/package_show?id=inscripciones-iniciales-de-autos";
const GLOBAL_CARS_URL =
  "https://raw.githubusercontent.com/serhatkildaci/global-car-models/main/data/models.json";

// Marcas remap (caso especial / acentos / capitalización / typos DNRPA).
const BRAND_MAP: Record<string, string> = {
  "MERCEDES BENZ": "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz",
  "MERCEDES BENZ.": "Mercedes-Benz",
  "ALFA ROMEO": "Alfa Romeo",
  "LAND ROVER": "Land Rover",
  "ASTON MARTIN": "Aston Martin",
  "MERCEDES AMG": "Mercedes-AMG",
  "ROLLS ROYCE": "Rolls-Royce",
  "MINI COOPER": "Mini",
  CITROEN: "Citroën",
  PEUGEOT: "Peugeot",
  VOLKSWAGEN: "Volkswagen",
  VOLSKWAGEN: "Volkswagen", // typo en DNRPA
  RENAULT: "Renault",
  CHEVROLET: "Chevrolet",
  FORD: "Ford",
  TOYOTA: "Toyota",
  FIAT: "Fiat",
  HONDA: "Honda",
  NISSAN: "Nissan",
  HYUNDAI: "Hyundai",
  KIA: "Kia",
  JEEP: "Jeep",
  AUDI: "Audi",
  BMW: "BMW",
  MERCEDES: "Mercedes-Benz",
  IVECO: "Iveco",
  SCANIA: "Scania",
  BYD: "BYD",
  GWM: "GWM",
  MG: "MG",
  RAM: "RAM",
  HINO: "Hino",
};

// Marcas "basura" del DNRPA: registros con datos incompletos. Filtramos.
const SKIP_BRANDS = new Set<string>([
  "SIN MARCA",
  "SIN ESPECIFICACION",
  "SIN ESPECIFICACIÓN",
  "NO CONSTA",
  "OTROS",
  "OTRO",
  "VARIOS",
  "ARMADO EN PAIS",
  "ARMADO EN ARGENTINA",
  "ARMADO NACIONAL",
]);

// Modelos multi-palabra que NO deben colapsarse al primer token.
const MULTI_WORD_MODELS = new Set([
  "CROSS FOX",
  "COROLLA CROSS",
  "YARIS CROSS",
  "COROLLA GR-SPORT",
  "GR YARIS",
  "GR COROLLA",
  "LAND CRUISER",
  "TRAIL BLAZER",
  "BEL AIR",
  "GOL TREND",
  "ONIX PLUS",
  "POLO TRACK",
  "POLO GTS",
  "GOLF GTI",
  "GOLF R",
  "C3 PICASSO",
  "C3 AIRCROSS",
  "C4 CACTUS",
  "C4 LOUNGE",
  "RAM 1500",
  "RAM 2500",
  "RAM 3500",
  "RANGE ROVER",
  "DISCOVERY SPORT",
  "GRAND CHEROKEE",
  "RIO 5",
  "MASTER PASSENGER",
  "S 10",
  "S10 HIGH",
  "GRAND SIENA",
  "FIAT 500",
  "ALFA ROMEO",
]);

const STRIP_PREFIXES = ["NUEVO ", "NUEVA ", "NEW "];

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function normalizeBrand(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (!up) return null;
  if (SKIP_BRANDS.has(up)) return null;
  if (BRAND_MAP[up]) return BRAND_MAP[up];
  // Skip marcas de camiones / acoplados / fabricantes locales raros.
  if (
    /^(ACOPLADOS|AA |BERTOTTO|BELGRANO|APEZ|COMAR|CARBALLIDO|CORADIR|COBRA|CAMC|CAN-AM|BEIBEN|ASTIVIA|AST-|AIMIX|BONANO|AGRALE)/.test(
      up,
    )
  ) {
    return null;
  }
  return titleCase(up);
}

function normalizeModel(raw: string): string | null {
  let s = raw.trim().toUpperCase();
  if (!s) return null;
  for (const p of STRIP_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  if (!s) return null;
  for (const mw of MULTI_WORD_MODELS) {
    if (s === mw || s.startsWith(mw + " ")) {
      return titleCase(mw);
    }
  }
  const first = s.split(/\s+/)[0];
  if (!first) return null;
  // Skip códigos puramente numéricos largos (códigos internos DNRPA tipo
  // "17.280" / "8.250" — son camiones/acoplados, no modelos de auto).
  if (/^\d+\.\d+$/.test(first)) return null;
  if (/^[0-9]/.test(first) || /^[A-Z]+-[0-9]/.test(first)) return first;
  return titleCase(first);
}

type CatalogEntry = {
  brand: string;
  model: string;
  source: "dnrpa" | "global" | "manual";
  origin?: string | null;
};

type CkanResource = { name: string; format: string; url: string };

async function fetchCkanResources(): Promise<CkanResource[]> {
  const res = await fetch(CKAN_API);
  const json = (await res.json()) as {
    result: { resources: CkanResource[] };
  };
  return json.result.resources;
}

/**
 * Parser CSV mínimo que respeta comillas dobles (los CSVs DNRPA 2018-2023
 * vienen con TODOS los campos quoted: "tramite_tipo","tramite_fecha",...).
 * Los CSVs 2024+ vienen sin quotes pero soportamos ambos formatos.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseCsvForCatalog(text: string): CatalogEntry[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idxMarca = header.indexOf("automotor_marca_descripcion");
  const idxModelo = header.indexOf("automotor_modelo_descripcion");
  const idxOrigen = header.indexOf("automotor_origen");
  if (idxMarca === -1 || idxModelo === -1) return [];

  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = splitCsvLine(lines[i]);
    if (cols.length < idxModelo + 1) continue;
    const brand = normalizeBrand(cols[idxMarca] ?? "");
    const model = normalizeModel(cols[idxModelo] ?? "");
    if (!brand || !model) continue;
    const key = `${brand}|${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const origen = (cols[idxOrigen] ?? "").trim();
    out.push({
      brand,
      model,
      source: "dnrpa",
      origin: /import/i.test(origen) ? "IMPORTADO" : "NACIONAL",
    });
  }
  return out;
}

async function fetchDnrpaMonth(url: string, label: string): Promise<CatalogEntry[]> {
  console.log(`  → Descargando ${label}…`);
  const res = await fetch(url);
  const text = await res.text();
  const entries = parseCsvForCatalog(text);
  console.log(`    ${entries.length} (marca,modelo) únicos`);
  return entries;
}

async function fetchDnrpaYearZip(
  url: string,
  year: string,
): Promise<CatalogEntry[]> {
  console.log(`  → Descargando ZIP ${year}…`);
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`    ${(buf.length / 1024 / 1024).toFixed(1)} MB, extrayendo…`);
  const zip = await JSZip.loadAsync(buf);
  const csvNames = Object.keys(zip.files).filter((n) =>
    n.toLowerCase().endsWith(".csv"),
  );
  const all: CatalogEntry[] = [];
  for (const name of csvNames) {
    const file = zip.file(name);
    if (!file) continue;
    const text = await file.async("text");
    const entries = parseCsvForCatalog(text);
    all.push(...entries);
  }
  // Dedup intra-year (mismos modelos aparecen en cada mes).
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  for (const e of all) {
    const key = `${e.brand}|${e.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  console.log(`    ${csvNames.length} CSVs → ${out.length} (marca,modelo) únicos`);
  return out;
}

async function fetchAllDnrpa(years: string[] | "latest"): Promise<CatalogEntry[]> {
  console.log("→ Resolviendo recursos DNRPA…");
  const resources = await fetchCkanResources();

  if (years === "latest") {
    const csv = resources.find((r) => r.format.toUpperCase() === "CSV");
    if (!csv) return [];
    console.log(`→ Modo último-mes: ${csv.name}`);
    return fetchDnrpaMonth(csv.url, csv.name);
  }

  console.log(`→ Modo histórico: años ${years.join(", ")}`);
  const out: Map<string, CatalogEntry> = new Map();
  for (const year of years) {
    const yearZip = resources.find((r) =>
      r.name.includes(`- ${year}`) && r.format.toUpperCase() === "ZIP",
    );
    const lastMonth = resources.find(
      (r) =>
        r.format.toUpperCase() === "CSV" && r.name.includes(year.toString()),
    );
    let yearEntries: CatalogEntry[] = [];
    if (yearZip) {
      yearEntries = await fetchDnrpaYearZip(yearZip.url, year);
    } else if (lastMonth) {
      yearEntries = await fetchDnrpaMonth(lastMonth.url, lastMonth.name);
    } else {
      console.log(`  ! ${year}: sin recursos en CKAN`);
      continue;
    }
    // Merge en map (la primera aparición se queda con el origen).
    for (const e of yearEntries) {
      const key = `${e.brand}|${e.model}`;
      if (!out.has(key)) out.set(key, e);
    }
  }
  console.log(`→ Total DNRPA tras dedup cross-año: ${out.size}`);
  return Array.from(out.values());
}

async function fetchGlobal(): Promise<CatalogEntry[]> {
  console.log("→ Descargando global-car-models…");
  const res = await fetch(GLOBAL_CARS_URL);
  const data = (await res.json()) as Record<string, string[]>;
  const out: CatalogEntry[] = [];
  for (const [brandRaw, models] of Object.entries(data)) {
    const brand = brandRaw.trim();
    if (!brand) continue;
    for (const modelRaw of models) {
      const model = modelRaw.trim();
      if (!model) continue;
      out.push({ brand, model, source: "global" });
    }
  }
  console.log(`  → ${out.length} entradas`);
  return out;
}

function parseArgs(): { years: string[] | "latest"; full: boolean } {
  const argv = process.argv.slice(2);
  if (argv.includes("--full")) {
    // Histórico completo: 2018-año actual.
    const now = new Date().getUTCFullYear();
    const years: string[] = [];
    for (let y = 2018; y <= now; y++) years.push(String(y));
    return { years, full: true };
  }
  const yearsArgIdx = argv.indexOf("--years");
  if (yearsArgIdx >= 0 && argv[yearsArgIdx + 1]) {
    const years = argv[yearsArgIdx + 1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { years, full: false };
  }
  return { years: "latest", full: false };
}

async function main() {
  const { years } = parseArgs();
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const [dnrpa, global] = await Promise.all([
    fetchAllDnrpa(years),
    fetchGlobal(),
  ]);

  const dnrpaKeys = new Set(dnrpa.map((e) => `${e.brand}|${e.model}`));
  const merged: CatalogEntry[] = [...dnrpa];
  let globalAdded = 0;
  for (const g of global) {
    const key = `${g.brand}|${g.model}`;
    if (!dnrpaKeys.has(key)) {
      merged.push(g);
      globalAdded++;
    }
  }
  console.log(
    `→ Merge: ${dnrpa.length} DNRPA + ${globalAdded} global nuevos = ${merged.length}`,
  );

  console.log("→ Upserting en car_catalog…");
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < merged.length; i += CHUNK) {
    const chunk = merged.slice(i, i + CHUNK).map((e) => ({
      brand: e.brand,
      model: e.model,
      source: e.source,
      origin: e.origin ?? null,
      last_seen_at: new Date().toISOString(),
    }));
    const { error, count } = await supabase
      .from("car_catalog")
      .upsert(chunk, {
        onConflict: "brand,model",
        ignoreDuplicates: false,
        count: "exact",
      });
    if (error) {
      console.error(`  ✗ chunk ${i}-${i + CHUNK} falló:`, error.message);
      continue;
    }
    inserted += count ?? chunk.length;
    process.stdout.write(`\r  → ${i + chunk.length}/${merged.length}…`);
  }
  console.log(`\n✓ Upsert terminado. ${inserted} rows afectadas.`);

  const { count: total } = await supabase
    .from("car_catalog")
    .select("*", { count: "exact", head: true });
  console.log(`→ Total en DB: ${total} entradas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

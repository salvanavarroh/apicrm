/**
 * Seed/refresh del catálogo de autos (tabla car_catalog).
 *
 * Fuentes:
 *   - DNRPA (Argentina, oficial): última CSV mensual de inscripciones iniciales.
 *     Resuelve la URL via CKAN API. ~12MB por mes, ~50k rows, ~1500 (marca,
 *     modelo) únicos después de normalizar.
 *   - global-car-models (MIT, fallback internacional): JSON con 94 marcas /
 *     ~1830 modelos. Cubre marcas que casi no aparecen en DNRPA.
 *
 * Estrategia de normalización:
 *   - Marca: title case ("VOLKSWAGEN" → "Volkswagen"). Algunas marcas se
 *     remappean a mano (MERCEDES BENZ → Mercedes-Benz).
 *   - Modelo: primer "palabra" del DNRPA porque viene con todos los trims
 *     ("AMAROK COMFORTLINE TDI AT 4X2 G2" → "Amarok"). Hay un mapa de
 *     compuestos para preservar "Corolla Cross", "C3 Aircross", etc.
 *   - Filtra entradas vacías y prefijos "Nuevo X" (son duplicados del modelo
 *     base).
 *
 * Cómo correrlo:
 *   pnpm tsx scripts/seed-car-catalog.ts
 *   (necesita NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en env)
 *
 * Para correr mensualmente, agregarlo a vercel.json cron o GitHub Action.
 */

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

// Marcas remap (caso especial / acentos / capitalización).
const BRAND_MAP: Record<string, string> = {
  "MERCEDES BENZ": "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz",
  "ALFA ROMEO": "Alfa Romeo",
  "LAND ROVER": "Land Rover",
  "ASTON MARTIN": "Aston Martin",
  "MERCEDES AMG": "Mercedes-AMG",
  "ROLLS ROYCE": "Rolls-Royce",
  "MINI COOPER": "Mini",
  CITROEN: "Citroën",
  PEUGEOT: "Peugeot",
  VOLKSWAGEN: "Volkswagen",
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
]);

// Prefijos a eliminar (son duplicados del modelo base).
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
  if (BRAND_MAP[up]) return BRAND_MAP[up];
  // Skip marcas de camiones agrícolas / acoplados / fabricantes locales raros.
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
  // Strip "NUEVO ", "NUEVA ", "NEW " prefixes.
  for (const p of STRIP_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  if (!s) return null;
  // Multi-word matches keep the full canonical name.
  for (const mw of MULTI_WORD_MODELS) {
    if (s === mw || s.startsWith(mw + " ")) {
      return titleCase(mw);
    }
  }
  // Default: take first word as model (drops trims/versions).
  const first = s.split(/\s+/)[0];
  if (!first) return null;
  // Preserve all-digit / mixed alphanumeric models AS-IS (208, S10, F-150).
  if (/^[0-9]/.test(first) || /^[A-Z]+-[0-9]/.test(first)) return first;
  // Title case for word models (Amarok, Cronos).
  return titleCase(first);
}

type CatalogEntry = {
  brand: string;
  model: string;
  source: "dnrpa" | "global" | "manual";
  origin?: string | null;
};

async function fetchLatestDnrpaUrl(): Promise<string | null> {
  console.log("→ Consultando CKAN para CSV DNRPA más reciente…");
  const res = await fetch(CKAN_API);
  const json = (await res.json()) as {
    result: { resources: Array<{ name: string; format: string; url: string }> };
  };
  const csvResources = json.result.resources.filter(
    (r) => r.format.toUpperCase() === "CSV",
  );
  if (csvResources.length === 0) {
    console.error("No hay CSVs en CKAN");
    return null;
  }
  // El primero suele ser el más reciente (CKAN ordena por created_at desc).
  console.log(`  → ${csvResources[0].name}`);
  return csvResources[0].url;
}

async function fetchDnrpa(): Promise<CatalogEntry[]> {
  const url = await fetchLatestDnrpaUrl();
  if (!url) return [];
  console.log("→ Descargando CSV…");
  const res = await fetch(url);
  const text = await res.text();
  console.log(`  → ${text.length} chars`);

  // CSV con BOM. Parser muy básico: split por '\n', luego por ',' respetando
  // comillas. Para evitar dependencias, asumimos que los campos relevantes
  // (marca, modelo, origen) no tienen comas dentro.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = lines[0].split(",");
  const idxMarca = header.indexOf("automotor_marca_descripcion");
  const idxModelo = header.indexOf("automotor_modelo_descripcion");
  const idxOrigen = header.indexOf("automotor_origen");
  if (idxMarca === -1 || idxModelo === -1) {
    console.error("Headers DNRPA no encontrados");
    return [];
  }

  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  let processed = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length - 2) continue;
    processed++;
    const brand = normalizeBrand(cols[idxMarca] ?? "");
    const model = normalizeModel(cols[idxModelo] ?? "");
    if (!brand || !model) continue;
    const origen = (cols[idxOrigen] ?? "").trim();
    const key = `${brand}|${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      brand,
      model,
      source: "dnrpa",
      origin: /import/i.test(origen) ? "IMPORTADO" : "NACIONAL",
    });
  }
  console.log(`  → ${processed} filas → ${out.length} (marca,modelo) únicos`);
  return out;
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

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const [dnrpa, global] = await Promise.all([fetchDnrpa(), fetchGlobal()]);

  // Merge: DNRPA primero (es el catálogo real local). Luego global solo
  // agrega marcas/modelos que DNRPA no tenga (sin pisar la fuente).
  const dnrpaKeys = new Set(dnrpa.map((e) => `${e.brand}|${e.model}`));
  const merged: CatalogEntry[] = [...dnrpa];
  for (const g of global) {
    const key = `${g.brand}|${g.model}`;
    if (!dnrpaKeys.has(key)) merged.push(g);
  }
  console.log(
    `→ Merge: ${dnrpa.length} (DNRPA) + ${global.length - (global.length - (merged.length - dnrpa.length))} (Global nuevos) = ${merged.length}`,
  );

  // Upsert en chunks de 500 para no romper límites del Postgres.
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

  // Verificación final.
  const { count: total } = await supabase
    .from("car_catalog")
    .select("*", { count: "exact", head: true });
  console.log(`→ Total en DB: ${total} entradas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Setup inicial de una concesionaria: deja la cuenta operativa en una corrida.
 *
 * El onboarding de 20 días se va casi entero en configuración repetitiva que es
 * igual en todas las concesionarias: sucursal principal, tipos de producto
 * (0km / usados / plan de ahorro), habilitación de tipos por sucursal y las
 * campañas de los canales que siempre están (mostrador, WhatsApp, web,
 * referidos, Meta, Google, TikTok, marketplace). Este script hace todo eso.
 *
 * Lo que NO hace (y no debería): crear usuarios. Los gerentes y vendedores se
 * invitan por email desde el panel, que es donde vive la lógica de invitación.
 * Las gerencias (branch × tipo → gerente) tampoco: dependen de qué gerentes
 * existan.
 *
 * Uso:
 *   pnpm seed:company --company <uuid> [--branch "Casa Central"] [--dry-run]
 *   pnpm seed:company --list          # lista las concesionarias con su id
 *
 * Idempotente: reruneable sin duplicar nada (busca por nombre antes de crear).
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Argumentos -------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const companyId = arg("company");
const branchName = arg("branch") ?? "Casa Central";
const dryRun = hasFlag("dry-run");

// --- Catálogo base ----------------------------------------------------------

/** Tipos de producto que maneja cualquier concesionaria de autos. */
const PRODUCT_TYPES = ["0km", "Usados", "Plan de ahorro"] as const;

/**
 * Campañas "de canal": una por origen que siempre existe. Sirven para que los
 * leads entren clasificados desde el día uno y los reportes por canal tengan
 * sentido antes de que marketing cargue sus campañas puntuales.
 */
const BASE_CAMPAIGNS: {
  name: string;
  origin: Database["public"]["Enums"]["campaign_origin"];
}[] = [
  { name: "Mostrador", origin: "showroom" },
  { name: "WhatsApp", origin: "whatsapp" },
  { name: "Web / Formulario", origin: "web" },
  { name: "Referidos", origin: "referral" },
  { name: "Llamada entrante", origin: "inbound_call" },
  { name: "Meta Ads", origin: "meta_ads" },
  { name: "Google Ads", origin: "google_ads" },
  { name: "Instagram", origin: "instagram" },
  { name: "TikTok Ads", origin: "tiktok_ads" },
  { name: "Marketplace", origin: "marketplace" },
  { name: "Portal de usados", origin: "portal_usados" },
];

// --- Helpers ----------------------------------------------------------------

let created = 0;
let skipped = 0;

function log(action: "creado" | "existe" | "dry", what: string) {
  if (action === "creado") created++;
  if (action === "existe") skipped++;
  const icon = action === "creado" ? "+" : action === "existe" ? "=" : "~";
  console.log(`  ${icon} ${what}`);
}

async function listCompanies() {
  // A propósito no se pide `plan`: este script sólo configura sucursal, tipos y
  // campañas, así que tiene que poder correrse en una base donde la migración
  // de planes todavía no se aplicó.
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  console.log("\nConcesionarias:\n");
  for (const c of data ?? []) {
    console.log(`  ${c.id}  ${c.name}  [${c.status}]`);
  }
  console.log(
    `\nCorré:  pnpm seed:company --company <uuid>${dryRun ? " --dry-run" : ""}\n`,
  );
}

async function main() {
  if (hasFlag("list") || !companyId) {
    await listCompanies();
    if (!companyId) {
      console.error("Falta --company <uuid>.");
      process.exit(hasFlag("list") ? 0 : 1);
    }
    return;
  }

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr) throw companyErr;
  if (!company) {
    console.error(`No existe la concesionaria ${companyId}.`);
    process.exit(1);
  }

  console.log(
    `\nSetup de "${company.name}"${dryRun ? "  (DRY RUN — no escribe nada)" : ""}\n`,
  );

  // --- 1. Sucursal --------------------------------------------------------
  console.log("Sucursal:");
  const { data: existingBranch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", company.id)
    .eq("name", branchName)
    .maybeSingle();

  let branchId = existingBranch?.id ?? null;
  if (branchId) {
    log("existe", branchName);
  } else if (dryRun) {
    log("dry", `${branchName} (se crearía)`);
  } else {
    const { data, error } = await supabase
      .from("branches")
      .insert({ company_id: company.id, name: branchName, status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    branchId = data.id;
    log("creado", branchName);
  }

  // --- 2. Tipos de producto ----------------------------------------------
  console.log("\nTipos de producto:");
  const { data: existingTypes } = await supabase
    .from("product_types")
    .select("id, name")
    .eq("company_id", company.id);
  const typeByName = new Map((existingTypes ?? []).map((t) => [t.name, t.id]));

  const typeIds: string[] = [];
  for (const name of PRODUCT_TYPES) {
    const found = typeByName.get(name);
    if (found) {
      typeIds.push(found);
      log("existe", name);
      continue;
    }
    if (dryRun) {
      log("dry", `${name} (se crearía)`);
      continue;
    }
    const { data, error } = await supabase
      .from("product_types")
      .insert({ company_id: company.id, name, status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    typeIds.push(data.id);
    log("creado", name);
  }

  // --- 3. Habilitar los tipos en la sucursal ------------------------------
  console.log("\nTipos habilitados en la sucursal:");
  if (!branchId || typeIds.length === 0) {
    console.log("  (dry run: falta la sucursal o los tipos)");
  } else {
    const { data: existingLinks } = await supabase
      .from("branch_product_types")
      .select("product_type_id")
      .eq("branch_id", branchId);
    const linked = new Set(
      (existingLinks ?? []).map((l) => l.product_type_id),
    );
    const toLink = typeIds.filter((id) => !linked.has(id));
    if (toLink.length === 0) {
      log("existe", `${typeIds.length} tipo(s) ya habilitados`);
    } else if (dryRun) {
      log("dry", `${toLink.length} tipo(s) a habilitar`);
    } else {
      const { error } = await supabase.from("branch_product_types").insert(
        toLink.map((product_type_id) => ({
          branch_id: branchId!,
          product_type_id,
        })),
      );
      if (error) throw error;
      log("creado", `${toLink.length} tipo(s) habilitados`);
    }
  }

  // --- 4. Campañas de canal ----------------------------------------------
  console.log("\nCampañas de canal:");
  const { data: existingCampaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("company_id", company.id);
  const campaignNames = new Set((existingCampaigns ?? []).map((c) => c.name));

  const missing = BASE_CAMPAIGNS.filter((c) => !campaignNames.has(c.name));
  for (const c of BASE_CAMPAIGNS.filter((c) => campaignNames.has(c.name))) {
    log("existe", c.name);
  }
  if (missing.length > 0) {
    if (dryRun) {
      for (const c of missing) log("dry", `${c.name} (se crearía)`);
    } else {
      const { error } = await supabase.from("campaigns").insert(
        missing.map((c) => ({
          company_id: company.id,
          name: c.name,
          origin: c.origin,
          status: "active" as const,
        })),
      );
      if (error) throw error;
      for (const c of missing) log("creado", c.name);
    }
  }

  // --- Resumen ------------------------------------------------------------
  console.log(
    dryRun
      ? "\nDry run terminado: nada se escribió.\n"
      : `\nListo: ${created} creado(s), ${skipped} ya existía(n).\n`,
  );

  if (!dryRun) {
    console.log("Lo que falta hacer desde el panel (necesita decisiones):");
    console.log("  1. Invitar al Admin y a los gerentes de venta.");
    console.log(
      "  2. Crear las gerencias (sucursal × tipo de producto → gerente).",
    );
    console.log("  3. Invitar vendedores y asignarles tipos de producto.");
    console.log("  4. Importar la lista de precios.");
    console.log("  5. Conectar WhatsApp y los formularios de Meta.\n");
  }
}

main().catch((err) => {
  console.error("Setup falló:", err);
  process.exit(1);
});

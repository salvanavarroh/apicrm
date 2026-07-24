/**
 * Backfill de leads.phone_e164 (Fase 0 mensajería).
 *
 * Recorre todas las empresas, toma su `country` (región por defecto) y normaliza
 * el `phone` de cada lead que todavía no tiene `phone_e164`. Usa `toE164Loose`:
 * si no logra un E.164 válido, guarda una versión sólo-dígitos antes que perder
 * el dato.
 *
 * Uso:  pnpm tsx scripts/backfill-phone-e164.ts [--dry]
 * Idempotente: sólo toca leads con phone_e164 null y phone no null.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import { toE164Loose } from "@/lib/phone";
import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");

if (!url || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BATCH = 500;

async function main() {
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, name, country");
  if (cErr) {
    console.error("Error leyendo empresas:", cErr.message);
    process.exit(1);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const company of companies ?? []) {
    let from = 0;
    let companyUpdated = 0;

    for (;;) {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, phone")
        .eq("company_id", company.id)
        .is("phone_e164", null)
        .not("phone", "is", null)
        .order("created_at", { ascending: true })
        .range(from, from + BATCH - 1);

      if (error) {
        console.error(`  [${company.name}] error:`, error.message);
        break;
      }
      if (!leads || leads.length === 0) break;

      for (const lead of leads) {
        const e164 = toE164Loose(lead.phone, company.country);
        if (!e164) {
          totalSkipped++;
          continue;
        }
        if (!DRY) {
          const { error: uErr } = await supabase
            .from("leads")
            .update({ phone_e164: e164 })
            .eq("id", lead.id);
          if (uErr) {
            console.error(`    lead ${lead.id}:`, uErr.message);
            continue;
          }
        }
        companyUpdated++;
        totalUpdated++;
      }

      if (leads.length < BATCH) break;
      from += BATCH;
    }

    if (companyUpdated > 0) {
      console.log(
        `  [${company.name ?? company.id}] (${company.country ?? "sin país"}): ${companyUpdated} leads ${DRY ? "a actualizar" : "actualizados"}`,
      );
    }
  }

  console.log(
    `\n${DRY ? "[DRY RUN] " : ""}Total: ${totalUpdated} actualizados, ${totalSkipped} sin teléfono parseable.`,
  );
}

main().then(() => process.exit(0));

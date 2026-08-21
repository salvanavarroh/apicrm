/**
 * Sincroniza la Guía Oficial de Precios de ACARA a `used_price_guide`.
 *
 * Uso autorizado por ACARA (gestionado por el cliente, socio de la entidad).
 *
 * La guía se releva por mes, así que esto corre una vez por mes. Un pedido por
 * marca (~142 en total): es lo que hace la diferencia entre un sync respetuoso y
 * miles de pedidos por versión.
 *
 * Cada corrida escribe su propio `as_of` y no pisa los meses anteriores: una
 * cotización vieja se tiene que poder reproducir tal como se hizo.
 *
 * Uso:
 *   pnpm sync:acara                  # la guía completa
 *   pnpm sync:acara --brand FIAT     # una marca (para probar)
 *   pnpm sync:acara --dry-run        # no escribe nada
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan credenciales de Supabase en .env.local");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = process.argv[i + 1];
  return i !== -1 && v && !v.startsWith("--") ? v : undefined;
}
const onlyBrand = arg("brand");
const dryRun = process.argv.includes("--dry-run");

/** Pausa entre marcas: no hay apuro y el servidor es de otro. */
const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { listBrands, fetchBrandTable, parsePriceTable } = await import(
    "@/lib/used-prices/acara"
  );

  const startedAt = Date.now();
  const asOf = new Date().toISOString().slice(0, 10);
  console.log(`\nGuía ACARA → as_of ${asOf}${dryRun ? "  (DRY RUN)" : ""}\n`);

  const brands = await listBrands();
  const targets = onlyBrand
    ? brands.filter((b) => b.name.toUpperCase().includes(onlyBrand.toUpperCase()))
    : brands;
  console.log(`marcas: ${targets.length}${onlyBrand ? ` (filtro "${onlyBrand}")` : ""}\n`);

  let ok = 0;
  let failed = 0;
  let upserted = 0;
  let skippedCells = 0;
  const currencies = new Map<string, number>();
  const years = new Set<number | null>();

  for (const [i, brand] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${brand.name}`;
    try {
      const html = await fetchBrandTable(brand.id);
      const { rows, skipped } = parsePriceTable(html, brand);
      skippedCells += skipped;
      for (const r of rows) {
        currencies.set(r.currency, (currencies.get(r.currency) ?? 0) + 1);
        years.add(r.year);
      }

      if (!dryRun && rows.length > 0) {
        // En tandas: una marca grande son miles de filas (una por versión × año).
        const CHUNK = 500;
        for (let c = 0; c < rows.length; c += CHUNK) {
          const batch = rows.slice(c, c + CHUNK).map((r) => ({
            source: "acara",
            vehicle_type: 1,
            brand_id: r.brandId,
            brand: r.brand,
            model_id: null,
            model: r.model,
            version_id: null,
            version: r.version,
            year: r.year,
            currency: r.currency,
            value: r.value,
            as_of: asOf,
          }));
          const { error } = await db
            .from("used_price_guide")
            .upsert(batch, {
              onConflict: "source,brand_id,model,version,year,as_of",
            });
          if (error) throw error;
        }
      }

      upserted += rows.length;
      ok++;
      console.log(`  ${label}: ${rows.length} valores${skipped ? ` (${skipped} celdas ignoradas)` : ""}`);
    } catch (e) {
      failed++;
      console.log(`  ${label}: FALLÓ — ${e instanceof Error ? e.message : e}`);
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  const durationMs = Date.now() - startedAt;

  console.log("\n───────────────────────────────────────────");
  console.log(`  marcas OK:        ${ok}`);
  console.log(`  marcas con error: ${failed}`);
  console.log(`  valores:          ${upserted}`);
  console.log(`  monedas:          ${[...currencies].map(([c, n]) => `${c}=${n}`).join(" · ")}`);
  const ys = [...years].filter((y): y is number => y !== null).sort((a, b) => b - a);
  console.log(`  años:             0km + ${ys[0]}…${ys[ys.length - 1]}`);
  console.log(`  celdas ignoradas: ${skippedCells}`);
  console.log(`  duración:         ${Math.round(durationMs / 1000)}s`);
  console.log("───────────────────────────────────────────\n");

  // Una tasa alta de celdas ignoradas es la señal de que ACARA cambió el
  // formato. Es preferible enterarse acá que descubrirlo cotizando.
  if (upserted > 0 && skippedCells / upserted > 0.05) {
    console.log(
      "OJO: se ignoró más del 5% de las celdas. Revisar si cambió el formato de la tabla.\n",
    );
  }

  if (!dryRun) {
    await db.from("used_price_syncs").insert({
      source: "acara",
      as_of: asOf,
      brands_ok: ok,
      brands_failed: failed,
      rows_upserted: upserted,
      duration_ms: durationMs,
      error: failed > 0 ? `${failed} marca(s) fallaron` : null,
    });
  }
}

main().catch((e) => {
  console.error("Falló:", e);
  process.exit(1);
});

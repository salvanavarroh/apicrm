import { NextResponse, type NextRequest } from "next/server";

import {
  fetchBrandTable,
  listBrands,
  parsePriceTable,
} from "@/lib/used-prices/acara";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sincroniza la Guía Oficial de Precios de ACARA.
 *
 * Uso autorizado por ACARA (gestionado por el cliente, socio de la entidad).
 *
 * La guía se releva por mes, así que esto corre UNA VEZ POR MES. Un pedido por
 * marca (~142); entre marcas hay una pausa deliberada.
 *
 * OJO — no está declarado en `vercel.json` a propósito: el plan Hobby admite
 * hasta 2 crons y ya están usados (pagos y planillas). Declarar un tercero hace
 * fallar el deploy completo, no sólo el cron — ya pasó una vez. Mientras el plan
 * siga en Hobby se dispara a mano (`pnpm sync:acara`) o desde un scheduler
 * externo con el CRON_SECRET.
 *
 * Es idempotente dentro del mismo día: la clave incluye `as_of` y usa
 * `nulls not distinct`, así que reintentarlo no duplica las unidades 0km.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 142 marcas con pausa de 1,2s ≈ 3 minutos.
export const maxDuration = 300;

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const asOf = new Date().toISOString().slice(0, 10);
  const db = createAdminClient();

  let ok = 0;
  let failed = 0;
  let rows = 0;
  let skipped = 0;

  try {
    const brands = await listBrands();
    for (const [i, brand] of brands.entries()) {
      try {
        const html = await fetchBrandTable(brand.id);
        const parsed = parsePriceTable(html, brand);
        skipped += parsed.skipped;

        const CHUNK = 500;
        for (let c = 0; c < parsed.rows.length; c += CHUNK) {
          const batch = parsed.rows.slice(c, c + CHUNK).map((r) => ({
            source: "acara",
            vehicle_type: 1,
            brand_id: r.brandId,
            brand: r.brand,
            model: r.model,
            version: r.version,
            year: r.year,
            currency: r.currency,
            value: r.value,
            as_of: asOf,
          }));
          const { error } = await db.from("used_price_guide").upsert(batch, {
            onConflict: "source,brand_id,model,version,year,as_of",
          });
          if (error) throw new Error(error.message);
        }
        rows += parsed.rows.length;
        ok++;
      } catch (e) {
        failed++;
        console.error(`[acara] ${brand.name}:`, (e as Error).message);
      }
      if (i < brands.length - 1) await sleep(DELAY_MS);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falló el sync" },
      { status: 500 },
    );
  }

  const durationMs = Date.now() - startedAt;
  await db.from("used_price_syncs").insert({
    source: "acara",
    as_of: asOf,
    brands_ok: ok,
    brands_failed: failed,
    rows_upserted: rows,
    duration_ms: durationMs,
    error: failed > 0 ? `${failed} marca(s) fallaron` : null,
  });

  return NextResponse.json({
    ok: true,
    asOf,
    brands: { ok, failed },
    rows,
    skippedCells: skipped,
    durationMs,
  });
}

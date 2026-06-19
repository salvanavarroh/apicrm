import { NextResponse, type NextRequest } from "next/server";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Catálogo en cascada para el form de leads.
 *   GET /api/cars/catalog?mode=brands&q=vol         → marcas distintas
 *   GET /api/cars/catalog?mode=models&brand=Ford&q= → modelos de esa marca
 * Devuelve { ok, items: string[] }. El catálogo no tiene versiones (texto libre).
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, items: [] }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "brands";
  const q = (sp.get("q") ?? "").trim().replace(/[%_\\]/g, "");
  const admin = createAdminClient();

  if (mode === "models") {
    const brand = (sp.get("brand") ?? "").trim();
    if (!brand) return NextResponse.json({ ok: true, items: [] });
    let query = admin
      .from("car_catalog")
      .select("model")
      .ilike("brand", brand) // sin wildcards = match exacto case-insensitive
      .order("model")
      .limit(200);
    if (q) query = query.ilike("model", `%${q}%`);
    const { data } = await query;
    const items = Array.from(new Set((data ?? []).map((r) => r.model))).slice(
      0,
      30,
    );
    return NextResponse.json({ ok: true, items });
  }

  // brands
  let query = admin
    .from("car_catalog")
    .select("brand")
    .order("brand")
    .limit(3000);
  if (q) query = query.ilike("brand", `%${q}%`);
  const { data } = await query;
  const items = Array.from(new Set((data ?? []).map((r) => r.brand))).slice(
    0,
    30,
  );
  return NextResponse.json({ ok: true, items });
}

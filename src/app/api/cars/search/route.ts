import { NextResponse, type NextRequest } from "next/server";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Búsqueda fuzzy del catálogo de autos para el autocomplete de leads/quotes.
 *
 * GET /api/cars/search?q=corolla&limit=15
 * Devuelve top N matches por similaridad (pg_trgm).
 *
 * Reglas:
 *   - Requiere usuario autenticado (cualquier rol — el catálogo es shared).
 *   - q < 2 chars: devuelve top brands para mostrar algo de inicio.
 *   - Match por marca O modelo (concatenados con espacio para que "vw amarok"
 *     también funcione).
 */
export async function GET(req: NextRequest) {
  const profile = await requireProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, items: [] }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") ?? "15"), 1),
    50,
  );

  const admin = createAdminClient();

  // Si query corto, devolvemos los 15 más comunes del catálogo (alphabetical
  // por marca/modelo). Sirve como "lista inicial" en el combobox.
  if (q.length < 2) {
    const { data } = await admin
      .from("car_catalog")
      .select("id, brand, model, source, origin")
      .order("brand")
      .order("model")
      .limit(limit);
    return NextResponse.json({ ok: true, items: data ?? [] });
  }

  // Query con > 2 chars: fuzzy con ILIKE en marca o modelo. Trgm devuelve mejor
  // ranking pero requiere RPC. Para mantenerlo simple usamos ILIKE + OR.
  // Patrón: tokens separados por espacio se buscan independientemente en
  // (brand || ' ' || model).
  const tokens = q.split(/\s+/).filter(Boolean);
  let query = admin
    .from("car_catalog")
    .select("id, brand, model, source, origin")
    .order("brand")
    .order("model")
    .limit(limit);

  for (const token of tokens) {
    const safe = token.replace(/[%_\\]/g, ""); // strip wildcards del usuario
    if (!safe) continue;
    query = query.or(`brand.ilike.%${safe}%,model.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message, items: [] },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

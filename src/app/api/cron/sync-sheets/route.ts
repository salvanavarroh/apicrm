import { NextResponse, type NextRequest } from "next/server";

import { syncSheetSource } from "@/lib/sheets/sync";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pollea las planillas de Google activas y crea los leads nuevos.
 *
 * Modo PULL: el cron es nuestro, así que no depende de que nadie mantenga un
 * script del lado del cliente. El caso principal es la hoja que TikTok Lead Gen
 * llena automáticamente mientras la campaña está activa.
 *
 * Cada fuente tiene su propio `poll_minutes`: acá se filtran las que ya les toca.
 * Así el cron puede correr seguido sin golpear a Google por cada planilla.
 *
 * Autenticación: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo agrega
 * solo cuando la ruta está declarada en vercel.json).
 *
 * OJO con la frecuencia: en `vercel.json` el cron quedó DIARIO porque el plan
 * Hobby sólo admite crons de frecuencia diaria — un `*/15 * * * *` hace fallar
 * el deploy entero, no sólo el cron. Con plan Pro se puede volver a poner cada
 * 15 minutos y `poll_minutes` de cada fuente vuelve a mandar. Mientras tanto,
 * cualquier scheduler externo puede pegarle a esta ruta con el CRON_SECRET.
 *
 * Se puede llamar a mano con `?force=1` para ignorar el intervalo, útil al
 * configurar una fuente nueva.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const admin = createAdminClient();

  const { data: sources, error } = await admin
    .from("sheet_sources")
    .select(
      "id, company_id, spreadsheet_id, gid, column_map, branch_id, product_type_id, campaign_id, poll_minutes, last_synced_at",
    )
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const due = (sources ?? []).filter((s) => {
    if (force || !s.last_synced_at) return true;
    const elapsed = now - new Date(s.last_synced_at).getTime();
    return elapsed >= s.poll_minutes * 60_000;
  });

  const results: Record<string, unknown>[] = [];
  for (const s of due) {
    try {
      const r = await syncSheetSource({
        id: s.id,
        company_id: s.company_id,
        spreadsheet_id: s.spreadsheet_id,
        gid: s.gid,
        column_map: (s.column_map ?? {}) as Record<string, string>,
        branch_id: s.branch_id,
        product_type_id: s.product_type_id,
        campaign_id: s.campaign_id,
      });
      // Un error de una planilla no debe frenar las demás: se guarda en la fila
      // para que se vea en la pantalla de configuración.
      if (!r.ok) {
        await admin
          .from("sheet_sources")
          .update({ last_error: r.message, last_synced_at: new Date().toISOString() })
          .eq("id", s.id);
      }
      results.push({ id: s.id, ...r });
    } catch (e) {
      const message = (e as Error).message;
      await admin
        .from("sheet_sources")
        .update({ last_error: message, last_synced_at: new Date().toISOString() })
        .eq("id", s.id);
      results.push({ id: s.id, ok: false, message });
    }
  }

  return NextResponse.json({
    checked: (sources ?? []).length,
    synced: due.length,
    imported: results.reduce((a, r) => a + (Number(r.imported) || 0), 0),
    results,
  });
}

import { sectionForPath, type ActivitySection } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

/**
 * Latido de presencia en el CRM. Lo llama `<ActivityTracker />` una vez por
 * minuto mientras el usuario está usando la app.
 *
 * Route handler y no server action, como el beacon del inbox: una server action
 * arrastra el ciclo de re-render de la ruta actual, y esto es telemetría de
 * fondo — no tiene que tocar en nada la pantalla que el vendedor está usando.
 *
 * `track_user_activity` es security definer y sólo escribe la fila del usuario
 * autenticado, así que el endpoint no sirve para marcar presente a nadie más.
 * La sección se re-deriva ACÁ del path que manda el cliente: así el valor que
 * entra a la base siempre es uno de los del catálogo, no texto libre.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 204 });

  let section: ActivitySection = "other";
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body.path === "string") section = sectionForPath(body.path);
  } catch {
    // Sin cuerpo válido igual registramos el minuto: el tiempo importa más que
    // saber en qué pantalla estaba.
  }

  await supabase.rpc("track_user_activity", { p_section: section });
  return new Response(null, { status: 204 });
}

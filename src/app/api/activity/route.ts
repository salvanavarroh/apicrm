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

  // El mismo latido mantiene viva la presencia del inbox.
  //
  // Antes el heartbeat de presencia vivía SÓLO en el toggle, y el toggle sólo
  // se monta en el inicio del vendedor y en el Inbox. Un vendedor que se
  // quedaba trabajando en Leads, en su agenda o en una ficha dejaba de latir y
  // a los 15 minutos el round-robin lo daba por ausente, sin que él hiciera
  // nada ni se enterara. Ahora cualquier pantalla del CRM lo sostiene.
  //
  // Sólo refresca la marca de tiempo: nunca PRENDE la presencia. Activarse
  // sigue siendo un acto explícito del vendedor.
  await supabase
    .from("profiles")
    .update({ inbox_available_at: new Date().toISOString() })
    .eq("id", user.id)
    .eq("inbox_available", true);

  return new Response(null, { status: 204 });
}

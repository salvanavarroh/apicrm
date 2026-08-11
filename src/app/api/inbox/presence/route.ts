import { createClient } from "@/lib/supabase/server";

/**
 * Apaga la presencia del inbox del usuario autenticado.
 *
 * Existe como route handler (y no como server action) porque se llama desde
 * `navigator.sendBeacon` en el evento `pagehide`: cuando el vendedor cierra el
 * browser o la pestaña, una server action ya no llega a ejecutarse, pero un
 * beacon sí — el browser lo despacha aunque el documento se esté destruyendo.
 *
 * Sólo APAGA, nunca prende. Así el endpoint no sirve para marcar disponible a
 * nadie: encenderse sigue siendo un acto explícito del vendedor desde el toggle.
 *
 * Sin esto, el vendedor quedaba `inbox_available = true` hasta que expiraba la
 * ventana de frescura (15 min) y el round-robin le seguía asignando
 * conversaciones que nadie iba a leer.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 204 también sin sesión: es un beacon, no hay nadie escuchando la respuesta
  // y no queremos ruido de 401 en los logs cuando la sesión ya expiró.
  if (!user) return new Response(null, { status: 204 });

  await supabase
    .from("profiles")
    .update({ inbox_available: false, inbox_available_at: null })
    .eq("id", user.id);

  return new Response(null, { status: 204 });
}

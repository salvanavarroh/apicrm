// ============================================================================
// GET /api/assistant/threads        → las últimas conversaciones del usuario
// GET /api/assistant/threads?id=…   → los mensajes de una conversación
//
// Los mensajes ya se venían guardando desde el primer día; lo que faltaba era
// leerlos. Al refrescar o cerrar el panel la charla desaparecía de la pantalla
// aunque estuviera entera en la base.
//
// Todo va con el cliente del usuario: la RLS de `assistant_threads` limita a las
// propias, así que no hay ni un filtro por `user_id` en este archivo y aun así
// nadie puede leer las de otro.
// ============================================================================

import { getCurrentProfile } from "@/lib/auth";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase } from "@/types/assistant-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope de mensajes que se devuelven de un hilo. */
const MAX_MESSAGES = 60;
/** Tope de conversaciones en el listado. */
const MAX_THREADS = 20;

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "No hay sesión." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const supabase = await createTypedClient<AssistantDatabase>();

  // ---- Un hilo puntual: sus mensajes ---------------------------------------
  if (id) {
    const { data: thread } = await supabase
      .from("assistant_threads")
      .select("id, title, created_at")
      .eq("id", id)
      .maybeSingle();
    // La RLS ya devolvió vacío si no es suyo: para el cliente es "no existe".
    if (!thread) return Response.json({ error: "No se encontró." }, { status: 404 });

    const { data: messages } = await supabase
      .from("assistant_messages")
      .select("id, role, content, route, feedback, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES);

    return Response.json({ thread, messages: messages ?? [] });
  }

  // ---- El listado ----------------------------------------------------------
  const { data: threads } = await supabase
    .from("assistant_threads")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_THREADS);

  return Response.json({ threads: threads ?? [] });
}

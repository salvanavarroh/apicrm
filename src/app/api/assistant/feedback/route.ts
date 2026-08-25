// ============================================================================
// POST /api/assistant/feedback — 👍 / 👎 sobre una respuesta.
//
// El 👎 no es sólo una métrica: convierte la pregunta en un hueco
// (`assistant_gaps`), que es de donde sale el próximo artículo de la base de
// conocimiento. Ver `docs/asistente-ia.md` §13.
// ============================================================================

import { embedOne } from "@/lib/ai/embed";
import { getCurrentProfile } from "@/lib/auth";
import { recordGap } from "@/lib/assistant/gaps";
import { effectiveRole } from "@/lib/permissions";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase } from "@/types/assistant-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "No hay sesión." }, { status: 401 });

  let body: { messageId?: unknown; value?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : null;
  const value = body.value === 1 || body.value === -1 ? body.value : null;
  if (!messageId || value === null) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }
  const note =
    typeof body.note === "string" ? body.note.slice(0, 500).trim() || null : null;

  const supabase = await createTypedClient<AssistantDatabase>();

  // La RLS ya limita el update a los mensajes de hilos del propio usuario.
  const { data, error } = await supabase
    .from("assistant_messages")
    .update({ feedback: value, feedback_note: note })
    .eq("id", messageId)
    .select("thread_id")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "No se encontró." }, { status: 404 });

  if (value === -1) {
    // Se busca la pregunta que originó esta respuesta para registrar el hueco
    // con el texto del usuario, no con el del asistente.
    const { data: prev } = await supabase
      .from("assistant_messages")
      .select("content, created_at")
      .eq("thread_id", data.thread_id)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const question = prev?.content ?? "";
    if (question) {
      const emb = await embedOne(question);
      await recordGap({
        question,
        embedding: emb.ok ? emb.vector : null,
        role: effectiveRole(profile),
        companyId: profile.company_id,
      });
    }
  }

  return Response.json({ ok: true });
}

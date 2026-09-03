// ============================================================================
// POST /api/assistant/chat — la conversación con el asistente, en streaming.
//
// Es un Route Handler y no un Server Action porque las acciones no streamean, y
// acá el número que el usuario percibe es el PRIMER TOKEN, no el total: 600 ms
// hasta la primera letra se sienten instantáneos aunque la respuesta entera
// tarde tres segundos.
//
// Formato: SSE (`data: {...}\n\n`), un evento por línea. Los eventos son los de
// `AnswerEvent`.
// ============================================================================

import { getCurrentProfile } from "@/lib/auth";
import { answerQuestion, type AnswerEvent } from "@/lib/assistant/answer";
import type { AssistantRoute, ToolName } from "@/lib/assistant/router";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase } from "@/types/assistant-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit en memoria por instancia, igual que en los endpoints públicos de
// formularios. Acá el usuario está autenticado, así que la clave es su id: esto
// no frena un ataque, frena un bucle de la UI o a alguien apurado.
const window = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (window.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  window.set(userId, hits);
  return hits.length > MAX_PER_WINDOW;
}

const MAX_QUESTION_CHARS = 600;

type Body = {
  question?: unknown;
  route?: unknown;
  threadId?: unknown;
  history?: unknown;
  previous?: unknown;
};

const ROUTES: AssistantRoute[] = [
  "charla",
  "permisos",
  "datos",
  "navegacion",
  "producto",
  "soporte",
];
const TOOLS: ToolName[] = [
  "misNumeros",
  "buscarLead",
  "misTareas",
  "estadoDeVenta",
  "miEquipo",
  "queHacerCon",
];

function parsePrevious(
  raw: unknown,
): { route: AssistantRoute; tool?: ToolName } | null {
  if (!raw || typeof raw !== "object") return null;
  const { route, tool } = raw as { route?: unknown; tool?: unknown };
  if (typeof route !== "string") return null;
  if (!ROUTES.includes(route as AssistantRoute)) return null;
  return {
    route: route as AssistantRoute,
    tool: TOOLS.includes(tool as ToolName) ? (tool as ToolName) : undefined,
  };
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "No hay sesión." }, { status: 401 });
  }
  if (profile.status !== "active") {
    return Response.json(
      { error: "Tu cuenta todavía no está activa." },
      { status: 403 },
    );
  }
  if (rateLimited(profile.id)) {
    return Response.json(
      { error: "Muchas preguntas seguidas. Esperá un momento." },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const question =
    typeof body.question === "string"
      ? body.question.slice(0, MAX_QUESTION_CHARS).trim()
      : "";
  if (!question) {
    return Response.json({ error: "Falta la pregunta." }, { status: 400 });
  }

  const route = typeof body.route === "string" ? body.route.slice(0, 200) : null;
  const history = Array.isArray(body.history)
    ? (body.history as { role: "user" | "assistant"; content: string }[])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .slice(-4)
    : [];

  // El turno anterior llega como pista del cliente. Sólo habilita repreguntas
  // cortas ("¿y mañana?"): no decide permisos ni alcance, así que no hace falta
  // verificarlo contra la base. Lo peor que puede hacer una pista falsa es
  // ejecutar una herramienta que el usuario podía ejecutar igual.
  const previous = parsePrevious(body.previous);

  const supabase = await createTypedClient<AssistantDatabase>();

  // Hilo: se reusa el que mande el cliente si es suyo (la RLS lo garantiza), o
  // se crea uno nuevo.
  let threadId = typeof body.threadId === "string" ? body.threadId : null;
  if (threadId) {
    const { data } = await supabase
      .from("assistant_threads")
      .select("id")
      .eq("id", threadId)
      .maybeSingle();
    if (!data) threadId = null;
  }
  if (!threadId) {
    const { data } = await supabase
      .from("assistant_threads")
      .insert({
        user_id: profile.id,
        company_id: profile.company_id,
        title: question.slice(0, 80),
      })
      .select("id")
      .single();
    threadId = data?.id ?? null;
  }

  if (threadId) {
    await supabase.from("assistant_messages").insert({
      thread_id: threadId,
      role: "user",
      content: question,
      route,
    });
  }

  const encoder = new TextEncoder();
  const send = (ev: AnswerEvent | { type: "thread"; id: string | null }) =>
    encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(send({ type: "thread", id: threadId }));

      let finalText = "";
      let finalRoute: string | null = null;
      let tool: string | null = null;
      let chunkIds: string[] = [];
      let latency = 0;

      try {
        for await (const ev of answerQuestion({
          question,
          profile,
          route,
          history,
          previous,
        })) {
          if (ev.type === "meta") {
            finalRoute = ev.route;
            tool = ev.tool;
            chunkIds = ev.chunkIds;
          }
          if (ev.type === "done") {
            finalText = ev.text;
            latency = ev.latencyMs;
          }
          if (ev.type === "replace") finalText = ev.text;
          controller.enqueue(send(ev));
        }
      } catch (e) {
        controller.enqueue(
          send({
            type: "error",
            message: e instanceof Error ? e.message : "error inesperado",
          }),
        );
      }

      // El registro va al final y fuera del camino crítico de la respuesta: si
      // falla, el usuario ya tuvo su respuesta igual.
      if (threadId && finalText) {
        try {
          const { data } = await supabase
            .from("assistant_messages")
            .insert({
              thread_id: threadId,
              role: "assistant",
              content: finalText,
              route: finalRoute,
              chunk_ids: chunkIds,
              tool_calls: tool ? [{ tool }] : [],
              latency_ms: latency,
            })
            .select("id")
            .single();
          if (data?.id) {
            // El id del mensaje habilita el 👍/👎 en la UI.
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "message", id: data.id })}\n\n`,
              ),
            );
          }
        } catch {
          // Ídem: no romper la respuesta por no poder guardarla.
        }
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Vercel/nginx: sin esto el proxy puede bufferear y matar el streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

// ============================================================================
// El orquestador. Junta todo y devuelve la respuesta en streaming.
//
// El orden ES la política, igual que en `bot/decide.ts`:
//
//   saneo → injection → ruteo → (caché) → herramienta o recuperación → modelo
//        → validación de salida → citas → registro
//
// Tres cosas que valen la pena mirar:
//
//  1. LA MITAD DE LAS RUTAS NO LLAMAN AL MODELO. Permisos, navegación y las
//     derivaciones se contestan con plantillas y datos. Son instantáneas,
//     gratis y auditables.
//
//  2. LO QUE SE CACHEA ES SÓLO "producto". Una respuesta con datos de la
//     concesionaria no entra a la caché nunca.
//
//  3. SI NO SABE, LO DICE. Si la recuperación no supera el umbral no se llama al
//     modelo: se responde que no sabe y se registra el hueco.
// ============================================================================

import type { ChatMessage } from "@/lib/ai/complete";
import { embedOne } from "@/lib/ai/embed";
import { completeStream } from "@/lib/ai/complete";
import type { Profile } from "@/lib/auth";
import { detectInjection, sanitizeInbound } from "@/lib/bot/injection";
import { loadAssistantContext } from "@/lib/assistant/context";
import { lookupCache, storeCache } from "@/lib/assistant/cache";
import { recordGap } from "@/lib/assistant/gaps";
import {
  dontKnowAnswer,
  MAX_ANSWER_CHARS,
  SUPPORT_EMAIL,
  validateAssistantAnswer,
} from "@/lib/assistant/output";
import {
  billingDeflection,
  incidentDeflection,
  knowledgeBlock,
  systemPrompt,
  toolBlock,
} from "@/lib/assistant/prompt";
import {
  renderChunks,
  retrieve,
  sourcesOf,
  type Source,
} from "@/lib/assistant/retrieve";
import { routeQuestion, type AssistantRoute } from "@/lib/assistant/router";
import { findTool, type ToolLink } from "@/lib/assistant/tools";

export type AnswerEvent =
  /** Llega primero: ruta elegida, fuentes y links. La UI ya puede pintarlos. */
  | {
      type: "meta";
      route: AssistantRoute;
      tool: string | null;
      sources: Source[];
      /** Ids de los fragmentos usados. Es lo que hace auditable la respuesta. */
      chunkIds: string[];
      links: ToolLink[];
      cached: boolean;
    }
  | { type: "delta"; text: string }
  /** La validación rechazó lo generado: la UI reemplaza lo que venía mostrando. */
  | { type: "replace"; text: string; reason: string }
  | { type: "done"; text: string; latencyMs: number }
  | { type: "error"; message: string };

/** El asistente es de SÓLO LECTURA. No hay ninguna ruta que escriba. */
export const READ_ONLY = true;

const MAX_HISTORY = 4;

export async function* answerQuestion(opts: {
  question: string;
  profile: Profile;
  route: string | null;
  history?: { role: "user" | "assistant"; content: string }[];
}): AsyncGenerator<AnswerEvent> {
  const started = Date.now();

  // ---------------------------------------------------------------- saneo --
  const question = sanitizeInbound(opts.question);

  // El ruteo es puro e instantáneo, así que se hace ANTES de tocar la red: sólo
  // la ruta de producto necesita un embedding, y no tiene sentido gastar una
  // llamada a la API en las otras.
  const decisionEarly = question.length >= 2 ? routeQuestion(question) : null;
  const needsEmbedding = decisionEarly?.route === "producto";

  // Las dos esperas independientes arrancan juntas: la cápsula son ~9 consultas
  // a Postgres y el embedding es una llamada a OpenAI. En serie se suman al
  // tiempo hasta el primer token; en paralelo cuesta el más lento de los dos.
  const [ctx, embedding] = await Promise.all([
    loadAssistantContext(opts.profile, opts.route),
    needsEmbedding
      ? embedOne(question).then((r) => (r.ok ? r.vector : null))
      : Promise.resolve(null),
  ]);

  if (question.length < 2) {
    yield* single("permisos", "Contame qué necesitás y te ayudo.", started);
    return;
  }

  // Acá el que escribe es un empleado autenticado, no un desconocido: el riesgo
  // no es que se robe un descuento sino que intente sacarle al modelo las
  // instrucciones o hacerlo hablar por la empresa. La detección es la misma.
  const injection = detectInjection(question);
  if (injection.suspicious) {
    yield* single(
      "soporte",
      "Esa pregunta no la puedo contestar. Si necesitás algo del sistema, " +
        `preguntámelo derecho, o escribinos a ${SUPPORT_EMAIL}.`,
      started,
    );
    return;
  }

  // ---------------------------------------------------------------- ruteo --
  const decision = decisionEarly ?? routeQuestion(question);

  // Derivaciones: no llaman al modelo ni a la base.
  if (decision.route === "soporte") {
    const text =
      decision.reason === "facturacion-plataforma"
        ? billingDeflection()
        : incidentDeflection(ctx.route);
    yield* single("soporte", text, started);
    return;
  }

  // Permisos y navegación: herramientas deterministas, sin modelo.
  if (decision.route === "permisos" || decision.route === "navegacion") {
    const toolName = decision.route === "permisos" ? "porQueNoVeo" : "dondeEsta";
    const tool = findTool(toolName);
    if (!tool) {
      yield* single(decision.route, dontKnowAnswer(), started);
      return;
    }
    const result = await tool.run(question, ctx);
    yield {
      type: "meta",
      route: decision.route,
      tool: toolName,
      sources: [],
      chunkIds: [],
      links: result.links ?? [],
      cached: false,
    };
    yield { type: "delta", text: result.data };
    yield { type: "done", text: result.data, latencyMs: Date.now() - started };
    return;
  }

  // ------------------------------------------------------------- con datos --
  if (decision.route === "datos" && decision.tool) {
    const tool = findTool(decision.tool);
    if (!tool) {
      yield* single("datos", dontKnowAnswer(), started);
      return;
    }
    const result = await tool.run(question, ctx);

    yield {
      type: "meta",
      route: "datos",
      tool: decision.tool,
      sources: [],
      chunkIds: [],
      links: result.links ?? [],
      cached: false,
    };

    // Algunas herramientas ya devuelven la respuesta redactada: no hay nada que
    // el modelo pueda agregar y sí mucho que puede arruinar.
    if (result.direct) {
      yield { type: "delta", text: result.data };
      yield { type: "done", text: result.data, latencyMs: Date.now() - started };
      return;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(ctx) },
      ...historyOf(opts.history),
      { role: "user", content: toolBlock(decision.tool, result.data) },
      { role: "user", content: `Pregunta: ${question}` },
    ];
    yield* generate(messages, started, []);
    return;
  }

  // ------------------------------------------------------------- producto --
  const retrieval = await retrieve({ question, ctx, embedding });

  // La caché va DESPUÉS del embedding porque necesita el vector, y antes de
  // generar. Sólo aplica a esta ruta.
  if (retrieval.embedding) {
    const hit = await lookupCache(retrieval.embedding, ctx.scopeKey);
    if (hit) {
      yield {
        type: "meta",
        route: "producto",
        tool: null,
        sources: hit.sources,
        chunkIds: [],
        links: [],
        cached: true,
      };
      yield { type: "delta", text: hit.answer };
      yield { type: "done", text: hit.answer, latencyMs: Date.now() - started };
      return;
    }
  }

  if (retrieval.empty) {
    // No se llama al modelo. Esta es la regla que hace que no invente.
    await recordGap({
      question,
      embedding: retrieval.embedding,
      role: ctx.role,
      companyId: ctx.profile.company_id,
    });
    yield* single("producto", dontKnowAnswer(), started);
    return;
  }

  const sources = sourcesOf(retrieval.chunks);
  yield {
    type: "meta",
    route: "producto",
    tool: null,
    sources,
    chunkIds: retrieval.chunks.map((c) => c.chunk_id),
    links: [],
    cached: false,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...historyOf(opts.history),
    { role: "user", content: knowledgeBlock(renderChunks(retrieval.chunks)) },
    { role: "user", content: `Pregunta: ${question}` },
  ];

  yield* generate(messages, started, sources, {
    cache: retrieval.embedding
      ? { question, embedding: retrieval.embedding, scopeKey: ctx.scopeKey }
      : null,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function historyOf(
  history?: { role: "user" | "assistant"; content: string }[],
): ChatMessage[] {
  return (history ?? []).slice(-MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 1500),
  }));
}

/** Respuesta de un solo bloque, sin modelo. */
async function* single(
  route: AssistantRoute,
  text: string,
  started: number,
): AsyncGenerator<AnswerEvent> {
  yield {
    type: "meta",
    route,
    tool: null,
    sources: [],
    chunkIds: [],
    links: [],
    cached: false,
  };
  yield { type: "delta", text };
  yield { type: "done", text, latencyMs: Date.now() - started };
}

/**
 * Genera con el modelo, valida y (si corresponde) guarda en caché.
 *
 * La validación corre al final, sobre el texto completo. Si rechaza, se emite un
 * `replace` y la UI reemplaza lo que venía mostrando: no se puede "des-enviar"
 * un stream, y esconder el problema sería peor que corregirlo a la vista.
 */
async function* generate(
  messages: ChatMessage[],
  started: number,
  sources: Source[],
  opts: {
    cache?: { question: string; embedding: number[]; scopeKey: string } | null;
  } = {},
): AsyncGenerator<AnswerEvent> {
  // El tope de tokens se deriva del tope de caracteres (~3,6 car/token) para que
  // el modelo no se quede sin presupuesto justo antes del punto final.
  const maxTokens = Math.ceil(MAX_ANSWER_CHARS / 3.6);

  let full = "";
  for await (const ev of completeStream({ messages, maxTokens })) {
    if (ev.type === "delta") {
      full += ev.text;
      yield { type: "delta", text: ev.text };
    } else if (ev.type === "error") {
      const fallback = dontKnowAnswer();
      yield { type: "replace", text: fallback, reason: ev.reason };
      yield { type: "done", text: fallback, latencyMs: Date.now() - started };
      return;
    }
  }

  const verdict = validateAssistantAnswer(full);
  if (!verdict.ok) {
    const fallback = dontKnowAnswer();
    yield { type: "replace", text: fallback, reason: verdict.reason };
    yield { type: "done", text: fallback, latencyMs: Date.now() - started };
    return;
  }

  if (opts.cache) {
    await storeCache({
      question: opts.cache.question,
      embedding: opts.cache.embedding,
      scopeKey: opts.cache.scopeKey,
      answer: verdict.text,
      sources,
    });
  }

  yield { type: "done", text: verdict.text, latencyMs: Date.now() - started };
}

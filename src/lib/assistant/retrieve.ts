// ============================================================================
// Recuperación híbrida.
//
// Vector + texto, fusionados por rango recíproco dentro de Postgres
// (`match_kb`). El detalle que importa acá arriba es el UMBRAL: el RRF sirve
// para ordenar, no para decidir si algo es relevante — siempre devuelve un
// número, aunque el mejor resultado no tenga nada que ver. Por eso `match_kb`
// devuelve además la similitud coseno, y el corte se hace sobre eso.
//
// Si nada supera el umbral NO se llama al modelo: se responde "no sé" y se
// registra el hueco. Es la regla que hace que el asistente no invente.
// ============================================================================

import { embedOne, toPgVector } from "@/lib/ai/embed";
import type { AssistantContext } from "@/lib/assistant/context";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase, KbMatch } from "@/types/assistant-db";

/**
 * Similitud coseno mínima para considerar que un fragmento responde.
 *
 * MEDIDO, no estimado. `pnpm kb:calibrate` corre 18 preguntas que tienen que
 * responderse y 10 que no existen en el CRM, contra el corpus real:
 *
 *   relevantes    mínimo 0,503   (18 preguntas)
 *   irrelevantes  máximo 0,490   (10 preguntas)
 *
 * A 0,50 pasan las 18 legítimas y no se cuela ninguna de las 10. La primera
 * versión de este archivo tenía 0,25 "por lo que se sabe del modelo": con ese
 * valor se colaban 8 de 10 y el asistente contestaba cualquier cosa. Es
 * exactamente para lo que existe el golden set.
 *
 * EL MARGEN ES FINO (0,013) y el conjunto de calibración es chico. Si el corpus
 * crece, hay que volver a correr `pnpm kb:calibrate` y mover esto. Lo que
 * protege mientras tanto no es el número sino las dos redes que hay alrededor:
 * la respuesta cita sus fuentes, y todo lo que cae abajo del umbral queda
 * registrado como hueco para que alguien lo mire.
 *
 * El sesgo es deliberado: un "no sé" de más es barato (queda registrado y se
 * convierte en documentación), una respuesta segura y equivocada es cara.
 */
export const MIN_SIMILARITY = 0.5;

/**
 * Un match del motor de texto en los primeros puestos también cuenta como
 * evidencia, aunque el vector no lo confirme: es el caso de los términos
 * exactos del dominio ("reingreso", "gerencia", "ACARA"), donde el embedding es
 * justamente el que falla.
 */
const STRONG_TEXT_RANK = 3;

export type RetrievalResult = {
  chunks: KbMatch[];
  /** El embedding de la consulta. Se reusa para la caché y para los huecos. */
  embedding: number[] | null;
  /** true = nada superó el umbral. El asistente tiene que decir que no sabe. */
  empty: boolean;
  reason: string;
};

export async function retrieve(opts: {
  question: string;
  ctx: AssistantContext;
  limit?: number;
  /**
   * Embedding ya calculado. El orquestador lo pide EN PARALELO con la carga de
   * la cápsula (§10 del doc): son dos esperas independientes de ~150 ms cada
   * una, y en serie se suman al tiempo hasta el primer token.
   */
  embedding?: number[] | null;
}): Promise<RetrievalResult> {
  const { question, ctx } = opts;

  const vector =
    opts.embedding ?? (await embedOne(question).then((r) => (r.ok ? r.vector : null)));
  if (!vector) {
    return { chunks: [], embedding: null, empty: true, reason: "sin embedding" };
  }
  const emb = { ok: true as const, vector };

  const supabase = await createTypedClient<AssistantDatabase>();
  const { data, error } = await supabase.rpc("match_kb", {
    query_embedding: toPgVector(emb.vector),
    query_text: question,
    p_role: ctx.role,
    // Los parámetros con default de Postgres se omiten con `undefined`, no con
    // `null`: mandar null pisaría el default con un null explícito.
    p_plan: ctx.plan ?? undefined,
    p_features: ctx.features,
    p_route: ctx.route ?? undefined,
    match_count: opts.limit ?? 5,
  });

  if (error) {
    return {
      chunks: [],
      embedding: emb.vector,
      empty: true,
      reason: `match_kb: ${error.message}`,
    };
  }

  const rows = (data ?? []) as KbMatch[];
  const relevant = rows.filter(
    (r) =>
      r.similarity >= MIN_SIMILARITY ||
      (r.text_rank !== null && r.text_rank <= STRONG_TEXT_RANK),
  );

  return {
    chunks: relevant,
    embedding: emb.vector,
    empty: relevant.length === 0,
    reason: relevant.length === 0 ? "nada supera el umbral" : "ok",
  };
}

/** Las citas que se muestran debajo de la respuesta. Deduplicadas por artículo. */
export type Source = {
  articleId: string;
  slug: string;
  title: string;
  summary: string | null;
};

export function sourcesOf(chunks: KbMatch[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of chunks) {
    if (seen.has(c.article_id)) continue;
    seen.add(c.article_id);
    out.push({
      articleId: c.article_id,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
    });
  }
  return out;
}

/** El bloque de fragmentos tal como entra al prompt. */
export function renderChunks(chunks: KbMatch[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.heading_path}\n${c.content}`,
    )
    .join("\n\n---\n\n");
}

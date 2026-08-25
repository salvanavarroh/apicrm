// ============================================================================
// Caché semántica.
//
// Las preguntas se repiten muchísimo: "¿cómo cargo un lead?" la hacen todos los
// vendedores nuevos. Con similitud > 0,95 sobre la misma clave de alcance se
// devuelve la respuesta guardada en ~80 ms y con costo cero. Estimado: 30–50 %
// de las consultas.
//
// SÓLO SE CACHEA LA RUTA "producto". Nunca una respuesta que tenga datos de la
// concesionaria: eso sería una fuga entre usuarios, y ninguna ganancia de
// latencia la justifica. La clave de alcance (rol + plan + módulos activos)
// asegura además que dos usuarios con distinto contexto no compartan respuesta,
// porque la respuesta correcta para cada uno es distinta.
//
// Se lee y se escribe con service-role: la tabla no tiene policies para
// `authenticated` justamente para que nadie la pueda envenenar desde afuera.
// ============================================================================

import { toPgVector } from "@/lib/ai/embed";
import type { Source } from "@/lib/assistant/retrieve";
import { createTypedAdminClient } from "@/lib/supabase/admin";
import type { AssistantDatabase } from "@/types/assistant-db";
import type { Json } from "@/types/database";

/** Similitud mínima para considerar que es la misma pregunta. */
export const CACHE_MIN_SIMILARITY = 0.95;

export type CacheHit = { answer: string; sources: Source[] };

export async function lookupCache(
  embedding: number[],
  scopeKey: string,
): Promise<CacheHit | null> {
  try {
    const admin = createTypedAdminClient<AssistantDatabase>();
    const { data, error } = await admin.rpc("match_assistant_cache", {
      query_embedding: toPgVector(embedding),
      p_scope_key: scopeKey,
      min_similarity: CACHE_MIN_SIMILARITY,
    });
    if (error || !data || data.length === 0) return null;

    const hit = data[0];
    // Contador de uso, para poder medir si la caché sirve. No se espera la
    // respuesta: sumar una visita no puede demorar la del usuario.
    void admin
      .rpc("bump_assistant_cache_hit", { p_id: hit.id })
      .then(() => undefined);

    return { answer: hit.answer, sources: (hit.sources ?? []) as Source[] };
  } catch {
    // La caché nunca puede romper una respuesta: si falla, se genera.
    return null;
  }
}

export async function storeCache(opts: {
  question: string;
  embedding: number[];
  scopeKey: string;
  answer: string;
  sources: Source[];
}): Promise<void> {
  try {
    const admin = createTypedAdminClient<AssistantDatabase>();
    await admin.from("assistant_cache").insert({
      scope_key: opts.scopeKey,
      question: opts.question.slice(0, 500),
      embedding: toPgVector(opts.embedding),
      answer: opts.answer,
      sources: opts.sources as unknown as Json,
      article_ids: opts.sources.map((s) => s.articleId),
    });
  } catch {
    // Idem: guardar en caché es una optimización, no parte de la respuesta.
  }
}

/**
 * Invalida las entradas que citan alguno de estos artículos.
 *
 * Lo llama `kb-sync` cuando un artículo cambia: si la documentación cambió, la
 * respuesta guardada quedó vieja.
 */
export async function invalidateCacheForArticles(
  articleIds: string[],
): Promise<number> {
  if (articleIds.length === 0) return 0;
  const admin = createTypedAdminClient<AssistantDatabase>();
  const { data } = await admin
    .from("assistant_cache")
    .delete()
    .overlaps("article_ids", articleIds)
    .select("id");
  return (data ?? []).length;
}

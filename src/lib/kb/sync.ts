// ============================================================================
// Reindexado incremental de la base de conocimiento.
//
// La idea entera es no re-embeber lo que no cambió. Cada fragmento lleva el
// sha256 de (ruta + contenido); al sincronizar se comparan los hashes contra lo
// que hay en la base y sólo se embebe la diferencia. Correr esto entero sobre
// toda la documentación tarda segundos y cuesta centavos, así que se puede
// enganchar al deploy sin pensarlo — que es justamente lo que hace que la base
// de conocimiento no pueda quedar atrás del código.
//
// Se usa desde dos lados: `scripts/kb-sync.ts` (todos los artículos) y la
// pantalla de `/super-admin/kb` (un artículo suelto que se acaba de editar).
// ============================================================================

import { embed, toPgVector } from "@/lib/ai/embed";
import { invalidateCacheForArticles } from "@/lib/assistant/cache";
import { embeddableText, splitMarkdown } from "@/lib/kb/parse";
import { createTypedAdminClient } from "@/lib/supabase/admin";
import type {
  AssistantDatabase,
  CompanyPlanEnum,
  KbSource,
  UserRoleEnum,
} from "@/types/assistant-db";

export type ArticleInput = {
  slug: string;
  title: string;
  summary: string | null;
  bodyMd: string;
  source: KbSource;
  sourcePath: string | null;
  audienceRoles: UserRoleEnum[] | null;
  minPlan?: CompanyPlanEnum | null;
  feature: string | null;
  routePrefix: string | null;
  keywords: string[];
};

export type SyncStats = {
  slug: string;
  articleId: string;
  chunks: number;
  embedded: number;
  removed: number;
  skipped: boolean;
};

type Admin = ReturnType<typeof createTypedAdminClient<AssistantDatabase>>;

export function kbAdminClient(): Admin {
  return createTypedAdminClient<AssistantDatabase>();
}

/**
 * Sincroniza un artículo y sus fragmentos.
 *
 * Devuelve cuántos fragmentos quedaron, cuántos hubo que embeber de nuevo y
 * cuántos se borraron. `skipped` = no cambió nada, ni siquiera se llamó a la API
 * de embeddings.
 */
export async function upsertArticle(
  admin: Admin,
  input: ArticleInput,
): Promise<SyncStats> {
  const chunks = splitMarkdown(input.title, input.bodyMd);

  // 1. El artículo.
  const { data: existing } = await admin
    .from("kb_articles")
    .select("id, version")
    .eq("slug", input.slug)
    .maybeSingle();

  const row = {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    body_md: input.bodyMd,
    source: input.source,
    source_path: input.sourcePath,
    audience_roles: input.audienceRoles,
    min_plan: input.minPlan ?? null,
    feature: input.feature,
    route_prefix: input.routePrefix,
    keywords: input.keywords,
  };

  let articleId: string;
  if (existing) {
    articleId = existing.id;
    await admin
      .from("kb_articles")
      .update({ ...row, version: (existing.version ?? 1) + 1 })
      .eq("id", articleId);
  } else {
    const { data, error } = await admin
      .from("kb_articles")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`No se pudo crear el artículo ${input.slug}: ${error?.message}`);
    }
    articleId = data.id;
  }

  // 2. Los fragmentos que ya están, por orden.
  const { data: current } = await admin
    .from("kb_chunks")
    .select("id, ord, content_hash")
    .eq("article_id", articleId);

  const byOrd = new Map((current ?? []).map((c) => [c.ord, c]));

  // 3. Qué hay que embeber: los nuevos y los que cambiaron de hash.
  const toEmbed = chunks.filter((c) => byOrd.get(c.ord)?.content_hash !== c.hash);

  let vectors: number[][] = [];
  if (toEmbed.length > 0) {
    const res = await embed(toEmbed.map((c) => embeddableText(c)));
    if (!res.ok) {
      throw new Error(`Embeddings de ${input.slug}: ${res.reason}`);
    }
    vectors = res.vectors;
  }

  // 4. Upsert de los que cambiaron.
  if (toEmbed.length > 0) {
    const rows = toEmbed.map((c, i) => ({
      article_id: articleId,
      ord: c.ord,
      heading_path: c.headingPath,
      content: c.content,
      tokens: c.tokens,
      content_hash: c.hash,
      embedding: toPgVector(vectors[i]),
    }));
    const { error } = await admin
      .from("kb_chunks")
      .upsert(rows, { onConflict: "article_id,ord" });
    if (error) throw new Error(`Upsert de fragmentos ${input.slug}: ${error.message}`);
  }

  // 5. Sobrantes: si el documento se acortó, los fragmentos de más se borran.
  const { data: removedRows } = await admin
    .from("kb_chunks")
    .delete()
    .eq("article_id", articleId)
    .gte("ord", chunks.length)
    .select("id");
  const removed = (removedRows ?? []).length;

  // 6. Si algo cambió, las respuestas cacheadas que citaban este artículo
  //    quedaron viejas.
  if (toEmbed.length > 0 || removed > 0) {
    await invalidateCacheForArticles([articleId]);
  }

  return {
    slug: input.slug,
    articleId,
    chunks: chunks.length,
    embedded: toEmbed.length,
    removed,
    skipped: toEmbed.length === 0 && removed === 0,
  };
}

/**
 * Borra los artículos generados o importados del repo que ya no existen.
 *
 * Nunca toca los `manual`: los escribió una persona y no están representados en
 * ningún archivo, así que "no aparece en la corrida" no significa "se borró".
 */
export async function deleteOrphans(
  admin: Admin,
  keepSlugs: string[],
): Promise<string[]> {
  const { data } = await admin
    .from("kb_articles")
    .select("id, slug, source")
    .in("source", ["repo", "generado"]);

  const keep = new Set(keepSlugs);
  const orphans = (data ?? []).filter((a) => !keep.has(a.slug));
  if (orphans.length === 0) return [];

  await admin
    .from("kb_articles")
    .delete()
    .in(
      "id",
      orphans.map((o) => o.id),
    );
  await invalidateCacheForArticles(orphans.map((o) => o.id));
  return orphans.map((o) => o.slug);
}

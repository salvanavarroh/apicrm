"use server";

// ============================================================================
// Curaduría de la base de conocimiento.
//
// Es la mitad humana del bucle de mejora: las preguntas que el asistente no supo
// contestar se agrupan solas, y desde acá se convierten en artículo. Lo que se
// escribe queda con `source = 'manual'`, que es la única categoría que el
// reindexado desde el repo no pisa nunca.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { kbAdminClient, upsertArticle } from "@/lib/kb/sync";
import { slugify } from "@/lib/kb/parse";
import type { UserRoleEnum } from "@/types/assistant-db";

const ROLES = [
  "super_admin",
  "admin",
  "group_admin",
  "manager",
  "supervisor",
  "sales",
  "data_provider",
] as const;

const schema = z.object({
  title: z.string().min(3, "Poné un título").max(120),
  summary: z.string().max(300).optional(),
  bodyMd: z.string().min(20, "El artículo está muy corto").max(20_000),
  /** Vacío = para todos los roles. */
  audienceRoles: z.array(z.enum(ROLES)).optional(),
  feature: z.string().max(40).optional(),
  routePrefix: z.string().max(120).optional(),
  keywords: z.string().max(500).optional(),
});

export type ArticleFormInput = z.input<typeof schema>;
type Result = { ok: true; slug: string } | { ok: false; message: string };

export async function saveManualArticle(
  input: ArticleFormInput,
  opts: { slug?: string; resolveGapId?: string } = {},
): Promise<Result> {
  await requireRole(["super_admin"]);

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const d = parsed.data;
  const slug = opts.slug ?? slugify(d.title);

  try {
    const admin = kbAdminClient();
    await upsertArticle(admin, {
      slug,
      title: d.title.trim(),
      summary: d.summary?.trim() || null,
      bodyMd: d.bodyMd,
      source: "manual",
      sourcePath: null,
      audienceRoles:
        d.audienceRoles && d.audienceRoles.length > 0
          ? (d.audienceRoles as UserRoleEnum[])
          : null,
      feature: d.feature?.trim() || null,
      routePrefix: d.routePrefix?.trim() || null,
      keywords: (d.keywords ?? "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    });

    if (opts.resolveGapId) {
      const { data: article } = await admin
        .from("kb_articles")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      await admin
        .from("assistant_gaps")
        .update({
          status: "respondido",
          resolved_article_id: article?.id ?? null,
        })
        .eq("id", opts.resolveGapId);
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar",
    };
  }

  revalidatePath("/super-admin/kb");
  return { ok: true, slug };
}

export async function deleteManualArticle(slug: string): Promise<Result> {
  await requireRole(["super_admin"]);
  const admin = kbAdminClient();
  // Sólo los manuales: los del repo se borran borrando el archivo y
  // reindexando, y los generados no se borran a mano nunca.
  const { error } = await admin
    .from("kb_articles")
    .delete()
    .eq("slug", slug)
    .eq("source", "manual");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/kb");
  return { ok: true, slug };
}

export async function dismissGap(id: string): Promise<{ ok: boolean }> {
  await requireRole(["super_admin"]);
  const admin = kbAdminClient();
  await admin
    .from("assistant_gaps")
    .update({ status: "descartado" })
    .eq("id", id);
  revalidatePath("/super-admin/kb");
  return { ok: true };
}

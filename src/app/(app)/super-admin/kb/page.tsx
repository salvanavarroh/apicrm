import { requireRole } from "@/lib/auth";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase } from "@/types/assistant-db";

import { KbManager, type ArticleRow, type GapRow } from "./kb-manager";

export default async function SuperAdminKbPage() {
  await requireRole(["super_admin"]);
  const supabase = await createTypedClient<AssistantDatabase>();

  const [gaps, articles, chunkCounts] = await Promise.all([
    supabase
      .from("assistant_gaps")
      .select("id, question, role, hits, created_at")
      .eq("status", "abierto")
      .order("hits", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("kb_articles")
      .select(
        "id, slug, title, summary, source, source_path, audience_roles, updated_at, body_md, feature, route_prefix, keywords",
      )
      .order("source", { ascending: true })
      .order("title", { ascending: true }),
    supabase.from("kb_chunks").select("article_id"),
  ]);

  const counts = new Map<string, number>();
  for (const c of chunkCounts.data ?? []) {
    counts.set(c.article_id, (counts.get(c.article_id) ?? 0) + 1);
  }

  const rows: ArticleRow[] = (articles.data ?? []).map((a) => ({
    ...a,
    chunks: counts.get(a.id) ?? 0,
  })) as ArticleRow[];

  const empty = rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Base de conocimiento
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Lo que sabe el asistente y lo que todavía no. Los artículos del repo y
          los derivados del código se regeneran solos; acá se curan los huecos y
          se escribe lo que falta.
        </p>
      </header>

      {empty && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-semibold">La base de conocimiento está vacía.</p>
          <p className="mt-1 text-muted-foreground">
            Corré <code className="text-xs">pnpm kb:build &amp;&amp; pnpm kb:sync</code> para
            indexarla. Hasta entonces el asistente sólo contesta permisos,
            navegación y datos: todo lo de producto va a responder «no sé».
          </p>
        </div>
      )}

      <KbManager gaps={(gaps.data ?? []) as GapRow[]} articles={rows} />
    </div>
  );
}

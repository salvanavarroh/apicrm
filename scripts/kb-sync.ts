/**
 * Sube la base de conocimiento a Postgres, incremental.
 *
 * Lee `.kb/articles.json` (lo genera `pnpm kb:build`), trocea, embebe SÓLO los
 * fragmentos cuyo hash cambió, borra los sobrantes y limpia los artículos del
 * repo que ya no existen. Los artículos `manual` (los que se escriben desde
 * /super-admin/kb) no se tocan nunca.
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY y OPENAI_API_KEY en .env.local.
 *
 * Uso:  pnpm kb:build && pnpm kb:sync
 *       pnpm kb:sync --dry   (no escribe: dice qué haría)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnvConfig } from "@next/env";

import type { ArticleInput } from "@/lib/kb/sync";

// Los imports se hoistean POR ENCIMA de cualquier sentencia, así que
// `@/lib/kb/sync` (que arrastra el cliente de Supabase, que valida el entorno al
// cargarse) se evaluaría antes de que `loadEnvConfig` haya leído .env.local.
// Por eso las dependencias con entorno se importan de forma diferida dentro de
// `main()`. El `import type` de arriba se borra en compilación: no cuenta.
loadEnvConfig(process.cwd());

const dry = process.argv.includes("--dry");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta ${name} en .env.local`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const { splitMarkdown } = await import("@/lib/kb/parse");
  const { deleteOrphans, kbAdminClient, upsertArticle } = await import(
    "@/lib/kb/sync"
  );

  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!dry) requireEnv("OPENAI_API_KEY");

  let articles: ArticleInput[];
  try {
    articles = JSON.parse(
      readFileSync(join(process.cwd(), ".kb/articles.json"), "utf8"),
    ) as ArticleInput[];
  } catch {
    console.error("No encontré .kb/articles.json. Corré antes: pnpm kb:build");
    process.exit(1);
  }

  if (dry) {
    let total = 0;
    for (const a of articles) {
      const n = splitMarkdown(a.title, a.bodyMd).length;
      total += n;
      console.log(`  ${a.slug.padEnd(34)} ${String(n).padStart(3)} fragmentos`);
    }
    console.log(`\n${articles.length} artículos · ${total} fragmentos. (--dry: no se escribió nada)`);
    return;
  }

  const admin = kbAdminClient();
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`\nSincronizando ${articles.length} artículos…\n`);
  for (const a of articles) {
    try {
      const stats = await upsertArticle(admin, a);
      embedded += stats.embedded;
      if (stats.skipped) skipped++;
      const mark = stats.skipped ? "=" : "↑";
      console.log(
        `  ${mark} ${stats.slug.padEnd(34)} ${String(stats.chunks).padStart(3)} frag · ` +
          `${stats.embedded} embebidos · ${stats.removed} borrados`,
      );
    } catch (e) {
      failed++;
      console.error(`  ✗ ${a.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const orphans = await deleteOrphans(
    admin,
    articles.map((a) => a.slug),
  );
  if (orphans.length > 0) {
    console.log(`\nBorrados por no existir más: ${orphans.join(", ")}`);
  }

  console.log(
    `\nListo. ${articles.length - skipped} actualizados, ${skipped} sin cambios, ` +
      `${embedded} fragmentos embebidos, ${failed} con error.\n`,
  );
  if (failed > 0) process.exit(1);
}

void main();

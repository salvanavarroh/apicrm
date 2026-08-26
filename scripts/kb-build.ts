/**
 * Arma la base de conocimiento del asistente: documentos del repo + artículos
 * derivados del código. Escribe `.kb/articles.json`.
 *
 * NO toca la red ni la base. Es a propósito: así corre en CI sin ningún secreto
 * y falla temprano si alguien rompió el generador o dejó un slug duplicado.
 * El que sube a Postgres es `pnpm kb:sync`.
 *
 * Uso:  pnpm kb:build
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateArticles } from "@/lib/kb/generate";
import {
  documentTitle,
  firstParagraph,
  slugify,
  splitMarkdown,
  toBlocks,
} from "@/lib/kb/parse";
import type { ArticleInput } from "@/lib/kb/sync";
import type { UserRoleEnum } from "@/types/assistant-db";

// ---------------------------------------------------------------------------
// Qué documentos entran, y para quién.
//
// La decisión que más afecta la calidad está acá: los documentos de DISEÑO y de
// ROADMAP se limitan a `super_admin`. Un vendedor que pregunta "¿cómo cargo
// leads con IA?" no tiene que recibir la explicación de una feature a medio
// construir como si estuviera disponible. Lo mismo con el PRD, que es de abril y
// describe cosas que después cambiaron.
// ---------------------------------------------------------------------------
type DocMeta = {
  path: string;
  audienceRoles: UserRoleEnum[] | null;
  feature: string | null;
  routePrefix: string | null;
};

const SOLO_SOPORTE: UserRoleEnum[] = ["super_admin"];
const TODOS = null;

const DOCS: DocMeta[] = [
  // Manual funcional del sistema. Es el documento más valioso de todos.
  { path: "docs/sistema-y-reglas.md", audienceRoles: TODOS, feature: null, routePrefix: null },
  // Intereses del cliente: se usa en la ficha de todos los roles.
  { path: "docs/intereses-del-cliente.md", audienceRoles: TODOS, feature: null, routePrefix: null },
  // Cotizador: sólo para quien lo puede usar, y sólo si el módulo está activo.
  {
    path: "docs/cotizador-usados.md",
    audienceRoles: ["admin", "manager", "supervisor", "sales", "super_admin"],
    feature: "cotizador",
    routePrefix: "/admin/valuations",
  },
  // Respuesta automática: manual de USO, con los rótulos de la pantalla.
  //
  // Antes acá estaba `bot-inbox-respuesta-automatica.md`, que es el documento de
  // DISEÑO: describe la tabla de configuración con sus nombres de columna
  // (`outside_hours`, `max_turns`, `idle_trigger_minutes`). El asistente los
  // citaba fielmente y le contestaba al admin con nombres de campos de base de
  // datos que en el CRM no existen por ningún lado. El diseño pasó a soporte y
  // este manual ocupó su lugar.
  {
    path: "docs/respuesta-automatica.md",
    audienceRoles: ["admin", "group_admin", "manager", "supervisor", "super_admin"],
    feature: "bot",
    routePrefix: "/admin/bot",
  },
  // Multimarca: sólo tiene sentido para quien maneja un grupo.
  {
    path: "docs/grupos-multimarca.md",
    audienceRoles: ["group_admin", "admin", "super_admin"],
    feature: null,
    routePrefix: "/group",
  },
  // Documentación de arquitectura y de diseño: soporte solamente.
  { path: "docs/bot-inbox-respuesta-automatica.md", audienceRoles: SOLO_SOPORTE, feature: "bot", routePrefix: null },
  { path: "docs/mensajeria-zernio-arquitectura.md", audienceRoles: SOLO_SOPORTE, feature: "inbox", routePrefix: null },
  { path: "docs/mensajeria-zernio-plan.md", audienceRoles: SOLO_SOPORTE, feature: "inbox", routePrefix: null },
  { path: "docs/carga-leads-ia.md", audienceRoles: SOLO_SOPORTE, feature: null, routePrefix: null },
  { path: "docs/roadmap-posventa.md", audienceRoles: SOLO_SOPORTE, feature: null, routePrefix: null },
  { path: "docs/asistente-ia.md", audienceRoles: SOLO_SOPORTE, feature: null, routePrefix: null },
  { path: "PRD_API_CRM_v2.md", audienceRoles: SOLO_SOPORTE, feature: null, routePrefix: null },
  { path: "README.md", audienceRoles: SOLO_SOPORTE, feature: null, routePrefix: null },
];

/** Los encabezados de un documento son buenas palabras clave, gratis. */
function keywordsOf(md: string): string[] {
  const out = new Set<string>();
  for (const b of toBlocks(md)) {
    if (b.kind !== "heading" || b.level === 1) continue;
    // Se saca la numeración ("5. Asignación automática" → "asignación automática").
    const clean = b.text.replace(/^\d+(\.\d+)*\.?\s*/, "").trim();
    if (clean.length > 3) out.add(clean.toLowerCase());
  }
  return [...out].slice(0, 30);
}

function fromDoc(meta: DocMeta): ArticleInput | null {
  let md: string;
  try {
    md = readFileSync(join(process.cwd(), meta.path), "utf8");
  } catch {
    console.warn(`  ⚠ no se pudo leer ${meta.path}, se saltea`);
    return null;
  }
  const fallback = meta.path.split("/").pop()!.replace(/\.md$/, "");
  const title = documentTitle(md, fallback);
  return {
    slug: slugify(fallback),
    title,
    summary: firstParagraph(md) || null,
    bodyMd: md,
    source: "repo",
    sourcePath: meta.path,
    audienceRoles: meta.audienceRoles,
    feature: meta.feature,
    routePrefix: meta.routePrefix,
    keywords: keywordsOf(md),
  };
}

function main() {
  const articles: ArticleInput[] = [];

  console.log("\n— Documentos del repo —");
  for (const meta of DOCS) {
    const a = fromDoc(meta);
    if (!a) continue;
    const chunks = splitMarkdown(a.title, a.bodyMd);
    console.log(
      `  ${a.slug.padEnd(34)} ${String(chunks.length).padStart(3)} fragmentos  ` +
        `[${a.audienceRoles ? a.audienceRoles.join(",") : "todos"}]`,
    );
    articles.push(a);
  }

  console.log("\n— Derivados del código —");
  for (const g of generateArticles()) {
    const a: ArticleInput = {
      slug: g.slug,
      title: g.title,
      summary: g.summary,
      bodyMd: g.bodyMd,
      source: "generado",
      sourcePath: null,
      audienceRoles: g.audienceRoles as UserRoleEnum[] | null,
      feature: g.feature,
      routePrefix: g.routePrefix,
      keywords: g.keywords,
    };
    const chunks = splitMarkdown(a.title, a.bodyMd);
    console.log(
      `  ${a.slug.padEnd(34)} ${String(chunks.length).padStart(3)} fragmentos  ` +
        `[${a.audienceRoles ? a.audienceRoles.join(",") : "todos"}]`,
    );
    articles.push(a);
  }

  // Validaciones. Un slug duplicado pisaría un artículo con otro sin avisar.
  const seen = new Map<string, number>();
  let problems = 0;
  for (const a of articles) {
    seen.set(a.slug, (seen.get(a.slug) ?? 0) + 1);
    if (!a.bodyMd.trim()) {
      console.error(`  ✗ ${a.slug}: cuerpo vacío`);
      problems++;
    }
    if (!a.title.trim()) {
      console.error(`  ✗ ${a.slug}: sin título`);
      problems++;
    }
  }
  for (const [slug, n] of seen) {
    if (n > 1) {
      console.error(`  ✗ slug duplicado: ${slug} (${n} veces)`);
      problems++;
    }
  }

  const totalChunks = articles.reduce(
    (n, a) => n + splitMarkdown(a.title, a.bodyMd).length,
    0,
  );

  mkdirSync(join(process.cwd(), ".kb"), { recursive: true });
  writeFileSync(
    join(process.cwd(), ".kb/articles.json"),
    JSON.stringify(articles, null, 2),
    "utf8",
  );

  console.log(
    `\n${articles.length} artículos · ${totalChunks} fragmentos · escrito en .kb/articles.json`,
  );
  if (problems > 0) {
    console.error(`\n${problems} problema(s). No subas esto.`);
    process.exit(1);
  }
  console.log("Listo. Ahora: pnpm kb:sync\n");
}

main();

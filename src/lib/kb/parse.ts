// ============================================================================
// Markdown → artículos → fragmentos.
//
// El troceado es lo que decide la calidad de la recuperación, así que las tres
// reglas que importan están acá y son testeables (`pnpm test:assistant`):
//
//  1. SE CORTA POR ENCABEZADO, no por cantidad de caracteres a ciegas. Un
//     fragmento que empieza a mitad de una idea no se recupera bien nunca.
//
//  2. CADA FRAGMENTO LLEVA SU RUTA ("Sistema y reglas › Asignación automática ›
//     Pool de candidatos") y esa ruta se antepone ANTES de embeber. Es el cambio
//     más barato con más impacto: sin él, un fragmento corto como "Empate → al
//     azar" no se parece a ninguna pregunta; con él, sí.
//
//  3. LAS TABLAS Y LOS BLOQUES DE CÓDIGO NO SE PARTEN, aunque pasen el tope. Una
//     tabla cortada al medio pierde los encabezados y deja de significar nada.
//
// Todo lo de este archivo es función pura menos `hashChunk`, que usa node:crypto.
// ============================================================================

import { createHash } from "node:crypto";

export type ParsedChunk = {
  ord: number;
  /** "Documento › Sección › Subsección". */
  headingPath: string;
  content: string;
  tokens: number;
  /** sha256 de (headingPath + content). Alimenta el reindexado incremental. */
  hash: string;
};

export type SplitOptions = {
  maxChars?: number;
  overlapChars?: number;
  /**
   * Sólo lo DIMINUTO se pega al fragmento anterior (una línea suelta bajo un
   * encabezado). Un umbral alto acá termina guardando contenido bajo el
   * encabezado equivocado, que es peor que tener un fragmento corto.
   */
  minChars?: number;
};

const DEFAULTS = { maxChars: 1200, overlapChars: 150, minChars: 60 };

/** Estimación de tokens. Alcanza para presupuestar contexto, no para facturar. */
export function estimateTokens(text: string): number {
  // ~3,6 caracteres por token en castellano. Se redondea para arriba.
  return Math.ceil(text.length / 3.6);
}

export function hashChunk(headingPath: string, content: string): string {
  return createHash("sha256")
    .update(`${headingPath}\n${content}`)
    .digest("hex")
    .slice(0, 32);
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** El texto que efectivamente se embebe: ruta + contenido. */
export function embeddableText(chunk: {
  headingPath: string;
  content: string;
}): string {
  return `${chunk.headingPath}\n\n${chunk.content}`;
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "text"; text: string }
  /** Tabla o código: atómicos, no se parten nunca. */
  | { kind: "atomic"; text: string };

/**
 * Parte el markdown en bloques.
 *
 * No es un parser de markdown completo ni quiere serlo: sólo necesita distinguir
 * encabezados, tablas y cercos de código del texto corriente.
 */
export function toBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  let fence: string[] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ kind: "text", text });
    paragraph = [];
  };
  const flushTable = () => {
    const text = table.join("\n").trim();
    if (text) blocks.push({ kind: "atomic", text });
    table = [];
  };

  for (const line of lines) {
    // Dentro de un cerco de código todo va literal, incluso lo que parece
    // encabezado o tabla.
    if (fence !== null) {
      fence.push(line);
      if (/^\s*```/.test(line)) {
        blocks.push({ kind: "atomic", text: fence.join("\n") });
        fence = null;
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushTable();
      fence = [line];
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushTable();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        // Se limpian los adornos de markdown del título: el texto plano
        // recupera mejor y la cita se lee mejor.
        text: heading[2].replace(/[*_`]/g, "").trim(),
      });
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flushParagraph();
      table.push(line);
      continue;
    }

    if (table.length > 0) flushTable();

    if (line.trim() === "") flushParagraph();
    else paragraph.push(line);
  }

  if (fence !== null) blocks.push({ kind: "atomic", text: fence.join("\n") });
  flushTable();
  flushParagraph();
  return blocks;
}

/** Corta un texto largo en piezas con solapamiento, respetando párrafos. */
function splitLongText(
  text: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const pieces: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };

  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > maxChars) {
      push();
      // Solapamiento: se arrastra la cola de la pieza anterior, cortada en un
      // límite de palabra para no partir un término al medio.
      const prev = pieces[pieces.length - 1] ?? "";
      const tail = prev.slice(-overlapChars);
      const clean = tail.slice(Math.max(0, tail.indexOf(" ") + 1));
      current = clean ? `${clean}\n\n` : "";
    }
    // Un párrafo solo más largo que el tope: se corta duro. Es raro y es mejor
    // que perderlo.
    if (p.length > maxChars) {
      push();
      for (let i = 0; i < p.length; i += maxChars) {
        pieces.push(p.slice(i, i + maxChars));
      }
      continue;
    }
    current += (current ? "\n\n" : "") + p;
  }
  push();
  return pieces;
}

/**
 * Trocea un documento markdown.
 *
 * `docTitle` encabeza la ruta de todos los fragmentos.
 */
export function splitMarkdown(
  docTitle: string,
  md: string,
  opts: SplitOptions = {},
): ParsedChunk[] {
  const maxChars = opts.maxChars ?? DEFAULTS.maxChars;
  const overlapChars = opts.overlapChars ?? DEFAULTS.overlapChars;
  const minChars = opts.minChars ?? DEFAULTS.minChars;

  const blocks = toBlocks(md);
  const stack: string[] = [];
  type Section = { path: string[]; heading: string | null; level: number; parts: string[] };
  const sections: Section[] = [];

  const currentPath = () => [docTitle, ...stack.filter(Boolean)];
  let current: Section = { path: currentPath(), heading: null, level: 1, parts: [] };

  for (const b of blocks) {
    if (b.kind === "heading") {
      if (current.parts.length > 0) sections.push(current);
      // El H1 es el título del documento: no se repite en la ruta.
      if (b.level === 1) stack.length = 0;
      else {
        stack.length = Math.max(0, b.level - 2);
        stack[b.level - 2] = b.text;
      }
      current = {
        path: currentPath(),
        heading: b.level === 1 ? null : b.text,
        level: b.level,
        parts: [],
      };
      continue;
    }
    current.parts.push(b.text);
  }
  if (current.parts.length > 0) sections.push(current);

  // CADA SECCIÓN ES SU PROPIO FRAGMENTO, con su ruta.
  //
  // La primera versión de esto arrastraba las secciones cortas a la siguiente
  // para no dejar fragmentos chiquitos. Estaba mal: el contenido terminaba
  // guardado bajo el encabezado equivocado, que es peor que ser corto — un
  // fragmento corto con la ruta correcta se recupera bien justamente porque la
  // ruta se antepone antes de embeber.
  //
  // Lo único que se pega al fragmento anterior es lo verdaderamente diminuto
  // (una línea suelta bajo un encabezado), y se pega CON su encabezado adentro
  // del texto, así no se pierde la información.
  const chunks: ParsedChunk[] = [];
  let ord = 0;

  const push = (headingPath: string, content: string) => {
    for (const piece of splitLongText(content, maxChars, overlapChars)) {
      chunks.push({
        ord: ord++,
        headingPath,
        content: piece,
        tokens: estimateTokens(piece),
        hash: hashChunk(headingPath, piece),
      });
    }
  };

  for (const section of sections) {
    const headingPath = section.path.join(" › ");
    const body = section.parts.join("\n\n").trim();
    if (!body) continue;

    const last = chunks[chunks.length - 1];
    if (body.length < minChars && last) {
      // Se pega al anterior, con su encabezado como parte del texto.
      const heading = section.heading
        ? `${"#".repeat(section.level)} ${section.heading}\n\n`
        : "";
      const merged = `${last.content}\n\n${heading}${body}`;
      if (merged.length <= maxChars) {
        last.content = merged;
        last.tokens = estimateTokens(merged);
        last.hash = hashChunk(last.headingPath, merged);
        continue;
      }
    }

    // Las piezas atómicas ya vienen enteras dentro de `parts`; `splitLongText`
    // sólo separa por párrafos, así que una tabla nunca se parte.
    push(headingPath, body);
  }

  return chunks;
}

/** Primer párrafo útil del documento, como resumen de una línea. */
export function firstParagraph(md: string, maxChars = 220): string {
  for (const b of toBlocks(md)) {
    if (b.kind !== "text") continue;
    const clean = b.text
      .replace(/^>\s?/gm, "")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length < 30) continue;
    return clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
  }
  return "";
}

/** El H1 del documento, o el nombre del archivo si no tiene. */
export function documentTitle(md: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? m[1].replace(/[*_`]/g, "").trim() : fallback;
}

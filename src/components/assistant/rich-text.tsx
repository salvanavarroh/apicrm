"use client";

// ============================================================================
// Un renderizador mínimo para las respuestas del asistente.
//
// No se agrega una librería de markdown por tres líneas de formato: el modelo
// tiene instrucciones de responder corto, con negritas, listas y rutas. Lo que
// sale de acá son nodos de React, nunca HTML crudo — no hay
// `dangerouslySetInnerHTML` en ningún lado.
//
// Las rutas de la app (`/admin/leads`) se convierten en links de verdad: es la
// mitad del valor de una respuesta de navegación.
// ============================================================================

import Link from "next/link";
import { Fragment } from "react";

/** `**negrita**`, `` `código` `` y rutas internas. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\/[a-z0-9\-/[\]]+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      const inner = token.slice(1, -1);
      parts.push(
        inner.startsWith("/") ? (
          <Link
            key={key}
            href={inner}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-accent hover:underline"
          >
            {inner}
          </Link>
        ) : (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {inner}
          </code>
        ),
      );
    } else {
      parts.push(
        <Link key={key} href={token} className="text-accent hover:underline">
          {token}
        </Link>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ul key={key} className="my-1 flex flex-col gap-1 pl-4">
        {list.map((item, i) => (
          <li key={i} className="list-disc marker:text-muted-foreground">
            {inline(item, `${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList(`l${idx}`);
    if (line.trim() === "") return;
    out.push(
      <p key={`p${idx}`} className="my-1 first:mt-0 last:mb-0">
        {inline(line, `p${idx}`)}
      </p>,
    );
  });
  flushList("l-end");

  return <Fragment>{out}</Fragment>;
}

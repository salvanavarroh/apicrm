import { normalize } from "@/lib/bot/guardrails";

// ============================================================================
// Clasificador de intención: híbrido, en dos pasos.
//
// Paso 1 — REGLAS. Palabras clave que cargó el admin. Gratis, instantáneo y
//   determinista. Resuelve la mayoría de los mensajes reales, que son cortos y
//   repetitivos ("hola", "atienden hoy?", "tienen hilux").
//
// Paso 2 — LLM, sólo si las reglas no matchean. Se le manda el mensaje y la
//   LISTA CERRADA de intenciones, y devuelve UNA etiqueta o `desconocida`.
//   NO redacta: elige. Un modelo que elige entre 8 opciones no puede inventar
//   un descuento.
//
// Si el LLM falla, se cae a `desconocida`, que tiene una respuesta segura.
// ============================================================================

export type IntentCandidate = {
  slug: string;
  label: string;
  keywords: string[];
};

export type Classification = {
  slug: string | null; // null = desconocida
  matchedBy: "keyword" | "llm" | "none";
};

/** Paso 1: match por palabras clave. Gana la intención con la palabra más larga
 *  (más específica): "no interesa el precio" debe pegarle a precio, no a "no". */
export function classifyByKeyword(
  text: string,
  intents: IntentCandidate[],
): Classification {
  const t = normalize(text);
  let best: { slug: string; len: number } | null = null;

  for (const intent of intents) {
    for (const kw of intent.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (t.includes(k) && (!best || k.length > best.len)) {
        best = { slug: intent.slug, len: k.length };
      }
    }
  }

  return best
    ? { slug: best.slug, matchedBy: "keyword" }
    : { slug: null, matchedBy: "none" };
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-mini";

/**
 * Paso 2: el LLM elige de la lista cerrada.
 *
 * Devuelve `null` ante cualquier problema (sin API key, error de red, etiqueta
 * fuera de la lista). Nunca inventa contenido porque nunca redacta.
 */
export async function classifyByLlm(
  text: string,
  intents: IntentCandidate[],
): Promise<Classification> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || intents.length === 0) {
    return { slug: null, matchedBy: "none" };
  }

  const labels = intents.map((i) => i.slug);
  const catalog = intents
    .map((i) => `- ${i.slug}: ${i.label}`)
    .join("\n");

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: "system",
            content:
              "Sos un clasificador de mensajes de clientes de una concesionaria " +
              "de autos en Argentina. Devolvés SOLO una etiqueta de la lista, sin " +
              "explicar nada. Si ninguna encaja con razonable seguridad, devolvés " +
              "'desconocida'.\n\nEtiquetas:\n" +
              catalog +
              "\n- desconocida: ninguna de las anteriores",
          },
          { role: "user", content: text.slice(0, 500) },
        ],
      }),
      // No dejamos que un LLM lento frene el webhook de mensajería.
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return { slug: null, matchedBy: "none" };
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = (json.choices?.[0]?.message?.content ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");

    // Se valida contra la lista: si devolvió algo que no está, es desconocida.
    if (!raw || raw === "desconocida" || !labels.includes(raw)) {
      return { slug: null, matchedBy: "none" };
    }
    return { slug: raw, matchedBy: "llm" };
  } catch {
    return { slug: null, matchedBy: "none" };
  }
}

/** Clasificación completa: reglas primero, LLM sólo si hace falta. */
export async function classify(
  text: string,
  intents: IntentCandidate[],
): Promise<Classification> {
  const byKeyword = classifyByKeyword(text, intents);
  if (byKeyword.slug) return byKeyword;
  return classifyByLlm(text, intents);
}

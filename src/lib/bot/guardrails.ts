import { HARD_BLOCKLIST } from "@/lib/bot/base-intents";

// ============================================================================
// Guardrails del bot. Corren ANTES del clasificador y no son configurables.
//
// Esta es la diferencia entre este bot y el que le ofreció descuentos no
// autorizados al cliente el año pasado. Si el mensaje toca plata, el bot no
// responde con contenido: acusa recibo y deriva.
// ============================================================================

/** Normaliza para comparar: sin acentos, sin puntuación, minúsculas. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabra que el cliente puede escribir para forzar el pase a una persona. */
export const HANDOFF_KEYWORDS = [
  "asesor",
  "humano",
  "persona",
  "vendedor",
  "hablar con alguien",
];

export type GuardrailVerdict =
  | { kind: "blocked"; matched: string }
  | { kind: "handoff"; matched: string }
  | { kind: "ok" };

/**
 * Evalúa el mensaje contra los límites duros.
 *
 * - `handoff`: el cliente pidió una persona. Se respeta siempre y de inmediato.
 * - `blocked`: menciona plata (precio, descuento, tasa, seña…). El bot no habla
 *   de números: contesta el mensaje de derivación y marca el lead como caliente.
 */
export function checkGuardrails(text: string): GuardrailVerdict {
  const t = normalize(text);

  // El pedido explícito de una persona gana sobre todo lo demás: es requisito
  // de Meta y lo que evita que el cliente se frustre y bloquee el número.
  for (const k of HANDOFF_KEYWORDS) {
    if (t.includes(normalize(k))) return { kind: "handoff", matched: k };
  }

  for (const term of HARD_BLOCKLIST) {
    if (t.includes(normalize(term))) return { kind: "blocked", matched: term };
  }

  return { kind: "ok" };
}

// ============================================================================
// Validación de la salida del asistente.
//
// POR QUÉ NO SE REUSA `validateAnswer` DEL BOT DEL INBOX. Los dos validan la
// salida de un modelo, pero el modelo de amenaza es distinto y por eso las
// reglas tienen que ser distintas:
//
//   · El bot del inbox le habla a un CLIENTE de la concesionaria. Ahí un importe
//     o un porcentaje es un compromiso comercial, y un link es un lugar al que
//     no queremos mandar a nadie. Se bloquean.
//
//   · Este asistente le habla a un EMPLEADO autenticado, sobre su propio CRM.
//     "Tenés 12 leads sin contactar" y "tu conversión del mes es 8 %" son
//     exactamente lo que se le pidió. Bloquear números acá lo rompería.
//
// Lo que sí se comparte es la defensa que importa en los dos casos: que el
// modelo no filtre sus instrucciones y que no mande a nadie fuera de la app.
//
// Del `injection.ts` del bot se reusan `sanitizeInbound` y `detectInjection`
// tal cual: sanear la entrada y detectar manipulación vale igual acá.
// ============================================================================

/** Señales de que el modelo largó sus instrucciones o cambió de personaje. */
const LEAK_RE =
  /\b(system prompt|mis instrucciones|mi prompt|como modelo de lenguaje|as an ai|i am an ai|openai|gpt-|prompt del sistema)\b/i;

/**
 * Links externos. Las rutas internas (`/admin/leads`) son deseables: son el
 * valor del asistente. Lo que no puede hacer es mandar a alguien afuera.
 */
const EXTERNAL_LINK_RE = /https?:\/\/|\bwww\.[a-z0-9-]+\./i;

/** Mails. El único permitido es el de soporte. */
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi;
export const SUPPORT_EMAIL = "hello@cambalache.studio";

/**
 * Tope de largo. Una respuesta de ayuda que no entra en la pantalla no ayuda.
 *
 * TIENE QUE ESTAR ALINEADO con el `maxTokens` de la generación (~3,6 caracteres
 * por token en castellano). La primera versión tenía 1400 caracteres contra 420
 * tokens: una respuesta de cinco pasos llegaba justo al tope de tokens y salía
 * cortada a mitad de frase. Si se mueve uno, hay que mover el otro.
 */
export const MAX_ANSWER_CHARS = 2000;

export type AssistantOutputVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export function validateAssistantAnswer(
  raw: string,
  opts: { maxChars?: number } = {},
): AssistantOutputVerdict {
  const maxChars = opts.maxChars ?? MAX_ANSWER_CHARS;
  const text = raw.trim();

  if (!text) return { ok: false, reason: "respuesta vacía" };
  if (text.length > maxChars) {
    return { ok: false, reason: `respuesta demasiado larga (${text.length})` };
  }
  if (LEAK_RE.test(text)) {
    return { ok: false, reason: "la respuesta filtra instrucciones del sistema" };
  }
  if (EXTERNAL_LINK_RE.test(text)) {
    return { ok: false, reason: "la respuesta incluye un link externo" };
  }

  const mails = text.match(EMAIL_RE) ?? [];
  const foreign = mails.filter(
    (m) => m.toLowerCase() !== SUPPORT_EMAIL.toLowerCase(),
  );
  if (foreign.length > 0) {
    // Un mail de un lead en una respuesta de datos es legítimo, pero sale de la
    // herramienta, no del modelo: en el texto generado no tiene por qué haber
    // ninguno que no sea el de soporte.
    return { ok: false, reason: "la respuesta incluye un mail que no es el de soporte" };
  }

  return { ok: true, text };
}

/**
 * Respuesta segura cuando el asistente no sabe.
 *
 * Un "no sé" honesto vale más que una respuesta plausible: es exactamente el
 * problema por el que el cliente descartó el chatbot anterior.
 */
export function dontKnowAnswer(topic?: string): string {
  return [
    topic
      ? `No tengo información sobre ${topic} en la documentación del CRM.`
      : "No tengo información sobre eso en la documentación del CRM.",
    `Prefiero decírtelo antes que inventarte una respuesta. Escribinos a ${SUPPORT_EMAIL} contándonos en qué pantalla estabas y qué esperabas que pasara — con eso lo resolvemos rápido, y de paso queda cargado para la próxima.`,
  ].join(" ");
}

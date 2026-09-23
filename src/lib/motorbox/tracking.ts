// ============================================================================
// El marcador de atribución de Motorbox.
//
// El problema: cuando un comprador toca "Contactar por WhatsApp" en una
// publicación, el mensaje entra por el inbox como cualquier otro WhatsApp. El
// referral de click-to-WhatsApp NO lo reenvía Zernio (ver la nota en
// handlers.ts, handleInboundMessage), así que API no tiene forma de saber que
// vino de Motorbox ni de qué auto.
//
// La solución: Motorbox prellena el mensaje con un código corto al final, y lo
// leemos acá. Ver docs/motorbox-spec-api.md §6.2.
// ============================================================================

// El código es el `public_code` del aviso: corto, legible, sin ambigüedad.
const MARKER = /\[MB:([A-Za-z0-9]{4,16})\]/;

/**
 * Busca el marcador en un texto. Devuelve el código, o null.
 *
 * Pasale también el caption de los adjuntos: mucha gente manda la foto del
 * aviso en vez del link.
 */
export function extractMotorboxCode(
  ...texts: Array<string | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = MARKER.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}

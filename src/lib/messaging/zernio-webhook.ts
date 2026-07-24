import { createHmac, timingSafeEqual } from "node:crypto";

// Verificación de webhooks de Zernio.
// Firma: header `X-Zernio-Signature` = HMAC-SHA256 (hex, minúscula) del RAW body,
// keyed con el webhook secret. Alias legacy: `X-Late-Signature`.
// Event id (idempotencia): `payload.id` = header `X-Zernio-Event-Id` (alias `X-Late-Event-Id`).

export const SIGNATURE_HEADERS = ["x-zernio-signature", "x-late-signature"];
export const EVENT_ID_HEADERS = ["x-zernio-event-id", "x-late-event-id"];

export function getHeader(
  headers: Headers,
  names: string[],
): string | null {
  for (const n of names) {
    const v = headers.get(n);
    if (v) return v;
  }
  return null;
}

/** Verifica la firma HMAC-SHA256 del raw body de forma timing-safe. */
export function verifyZernioSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type ZernioEventBase = {
  id?: string;
  event?: string;
  timestamp?: string;
  [k: string]: unknown;
};

/** Extrae el id de evento (para dedup) del payload o los headers. */
export function extractEventId(
  payload: ZernioEventBase,
  headers: Headers,
): string | null {
  return payload.id ?? getHeader(headers, EVENT_ID_HEADERS);
}

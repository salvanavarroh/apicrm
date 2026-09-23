import { createHmac } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { safeEqual } from "@/lib/motorbox/auth";

// ============================================================================
// Firma de los webhooks entre Motorbox y API, en las dos direcciones.
//
// HMAC-SHA256 sobre `${timestamp}.${rawBody}` — el timestamp entra en la firma
// para que un atacante no pueda reusar un body capturado con un timestamp
// nuevo. Ventana de 5 minutos.
//
// Mismo espíritu que la verificación de Zernio (src/lib/messaging/zernio-webhook.ts),
// pero con timestamp: acá lo definimos nosotros y conviene hacerlo bien.
// ============================================================================

/** Tolerancia de replay. Fuera de esta ventana el evento se rechaza. */
const REPLAY_WINDOW_SECONDS = 300;

export function signPayload(
  rawBody: string,
  timestamp: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing" | "stale" | "bad_signature" };

/**
 * Verifica un webhook ENTRANTE de Motorbox.
 *
 * Headers: `X-Motorbox-Timestamp` (epoch en segundos) y
 * `X-Motorbox-Signature` (`sha256=<hex>`).
 */
export function verifyMotorboxWebhook(
  rawBody: string,
  headers: Headers,
): VerifyResult {
  const secret = getServerEnv().MOTORBOX_WEBHOOK_SECRET;
  // Sin secreto no verificamos nada, y sin verificar no se procesa: este
  // endpoint crea leads. Preferimos rechazar a confiar.
  if (!secret) return { ok: false, reason: "not_configured" };

  const timestamp = headers.get("x-motorbox-timestamp");
  const signature = headers.get("x-motorbox-signature");
  if (!timestamp || !signature) return { ok: false, reason: "missing" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing" };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > REPLAY_WINDOW_SECONDS) return { ok: false, reason: "stale" };

  const expected = signPayload(rawBody, timestamp, secret);
  const received = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!safeEqual(expected, received)) return { ok: false, reason: "bad_signature" };

  return { ok: true };
}

/** Los headers firmados para un webhook SALIENTE hacia Motorbox. */
export function signOutbound(rawBody: string): Record<string, string> | null {
  const secret = getServerEnv().API_CRM_WEBHOOK_SECRET;
  if (!secret) return null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    "content-type": "application/json",
    "x-apicrm-timestamp": timestamp,
    "x-apicrm-signature": `sha256=${signPayload(rawBody, timestamp, secret)}`,
  };
}

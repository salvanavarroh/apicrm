import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";

// Autenticación de las llamadas server-to-server de Motorbox hacia nosotros.

/** Compara dos strings en tiempo constante, sin filtrar la longitud por timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * ¿La request trae `Authorization: Bearer <MOTORBOX_PARTNER_KEY>`?
 *
 * Devuelve false si la key no está configurada: sin credencial no se atiende a
 * nadie (mejor 401 que un endpoint abierto porque falta una env var).
 */
export function isMotorboxRequest(req: Request): boolean {
  const expected = getServerEnv().MOTORBOX_PARTNER_KEY;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  return safeEqual(token, expected);
}

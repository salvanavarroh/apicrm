import { toE164 } from "@/lib/phone";

/**
 * Normaliza a E.164 el `display_phone_number` que devuelve Zernio/Meta.
 *
 * Meta lo manda formateado para humanos ("+54 9 11 1234-5678"), así que hay que
 * limpiarlo antes de guardarlo. Si ya viene con `+` alcanza con sacarle el
 * ruido; si viene sin prefijo internacional, se resuelve con el país de la
 * empresa, igual que `resolveCompanyE164` para los teléfonos de leads.
 *
 * Devuelve null si no se puede formar un número válido: preferimos una columna
 * vacía a un teléfono roto, porque este dato termina siendo el link de WhatsApp
 * de una publicación de Motorbox.
 */
export function normalizeChannelPhone(
  displayPhoneNumber: string | null | undefined,
  companyCountry: string | null,
): string | null {
  if (!displayPhoneNumber) return null;
  const raw = displayPhoneNumber.trim();
  if (!raw) return null;

  const viaLib = toE164(raw, companyCountry);
  if (viaLib) return viaLib;

  // Fallback: Meta casi siempre manda el número internacional completo. Si la
  // librería no lo pudo parsear (país raro, formato inesperado) igual guardamos
  // la versión limpia, que es lo que el link de wa.me necesita.
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `+${digits}`;
}

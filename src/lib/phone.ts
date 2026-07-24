import {
  parsePhoneNumberFromString,
  type CountryCode,
  type MetadataJson,
} from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.max.json";

// Normalización de teléfonos multi-país (Fase 0 mensajería).
//
// El CRM es multi-país LATAM. La "región por defecto" con la que se parsea un
// número LOCAL (sin código de país) es el país de la empresa (`companies.country`).
// Los números que llegan de WhatsApp / Lead Ads ya vienen en E.164 completo y se
// parsean sin importar la región.
//
// libphonenumber-js resuelve las trampas por país (el "9"/"15" de AR, el "1"
// histórico de MX, el "9" de los móviles, etc.) — por eso NO usamos regex casero.
//
// Usamos el build `/core` con metadata explícita (`metadata.max.json`) porque el
// wrapper del build por defecto pierde la metadata bajo esbuild/tsx.

const META = metadata as unknown as MetadataJson;

// País por defecto si la empresa no tiene `country` seteado (dato viejo).
export const DEFAULT_REGION: CountryCode = "AR";

// Países soportados hoy (español LATAM). Brasil (BR/pt) queda para más adelante.
export const SUPPORTED_REGIONS: CountryCode[] = [
  "AR",
  "UY",
  "MX",
  "CL",
  "CO",
  "PE",
  "BO",
  "PY",
  "EC",
  "VE",
  "CR",
  "PA",
  "GT",
  "DO",
];

function coerceRegion(region: string | null | undefined): CountryCode {
  if (!region) return DEFAULT_REGION;
  const up = region.trim().toUpperCase();
  return (SUPPORTED_REGIONS as string[]).includes(up)
    ? (up as CountryCode)
    : DEFAULT_REGION;
}

/**
 * Normaliza un teléfono a formato E.164 canónico (`+549...`, `+521...`, etc.).
 * Devuelve null si no se puede parsear a un número válido.
 * Si el número trae "+", se interpreta como internacional (la región se ignora).
 *
 * @param raw    Teléfono en cualquier formato (local o internacional).
 * @param region País de la empresa (ISO-2). Región por defecto para números locales.
 */
export function toE164(
  raw: string | null | undefined,
  region?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const country = coerceRegion(region);
  try {
    const parsed = parsePhoneNumberFromString(trimmed, country, META);
    if (parsed && parsed.isValid()) {
      return parsed.number; // E.164, ej. "+5491155551234"
    }
  } catch {
    // parseo falló → null
  }
  return null;
}

/**
 * Normaliza el `wa_id` de WhatsApp a E.164, corrigiendo los dos quirks clásicos
 * de LATAM antes de parsear:
 *   - Argentina: el wa_id a veces viene SIN el "9" del móvil (`54 11 …`). Como en
 *     WhatsApp todo destino es móvil, insertamos el "9" (`549 11 …`).
 *   - México: el wa_id a veces trae un "1" de más después del `+52` (`521 …`),
 *     herencia del formato viejo. Lo quitamos.
 * Se usa en la ingesta de mensajes/Lead Ads (Fase 2+), donde sabemos que el
 * número es un móvil real. Para datos tipeados por un humano usar `toE164`.
 */
export function normalizeWaId(
  waId: string | null | undefined,
  region?: string | null,
): string | null {
  if (!waId) return null;
  let digits = waId.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;

  // México: +52 1 XXXXXXXXXX (13 dígitos) → +52 XXXXXXXXXX
  if (digits.startsWith("521") && digits.length === 13) {
    digits = "52" + digits.slice(3);
  }
  // Argentina: +54 <10 dígitos> sin el 9 → +54 9 <10 dígitos>
  if (
    digits.startsWith("54") &&
    !digits.startsWith("549") &&
    digits.length === 12
  ) {
    digits = "549" + digits.slice(2);
  }

  return toE164("+" + digits, region);
}

/**
 * Igual que toE164 pero, si no logra un número válido, devuelve una versión
 * "sólo dígitos con +" como último recurso (para no perder el dato). Útil en
 * backfill donde preferimos guardar algo canónico-ish antes que null.
 */
export function toE164Loose(
  raw: string | null | undefined,
  region?: string | null,
): string | null {
  const strict = toE164(raw, region);
  if (strict) return strict;
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

import { getServerEnv, publicEnv } from "@/lib/env";

// ============================================================================
// Configuración de la integración con Motorbox.
//
// Todas las env vars son opcionales a propósito: mientras no estén cargadas, la
// integración se apaga sola (el ítem del menú no aparece, los endpoints
// devuelven 503) en vez de romper el build o servir un iframe roto. El mismo
// criterio que usa la mensajería de Zernio.
//
// Ver docs/motorbox-spec-api.md §11.
// ============================================================================

/** El `aud` del ticket SSO. Motorbox lo valida tal cual. */
export const MOTORBOX_AUDIENCE = "motorbox";

/** Vida del ticket, en segundos. Corto a propósito: es de un solo uso. */
export const TICKET_TTL_SECONDS = 90;

/**
 * El `iss` del ticket y el origen del parent que Motorbox valida en cada
 * postMessage. Tiene que ser EXACTO: un `www` de más o de menos y Motorbox
 * rechaza todos los tickets sin decir por qué.
 *
 * Sale de `MOTORBOX_ISSUER`, con `NEXT_PUBLIC_APP_URL` como fallback para
 * desarrollo. Están separadas por algo: `NEXT_PUBLIC_APP_URL` la usan los mails
 * de invitación, el reset de contraseña y el callback de OAuth de Zernio, que
 * pueden estar registrados contra un host distinto del canónico. Cuando eran la
 * misma variable, el ticket salió con `iss` sin `www` y Motorbox lo rechazó
 * entero (23/09/2026) — y arreglarlo del lado de `NEXT_PUBLIC_APP_URL` habría
 * cambiado la URL del callback de Zernio de arrastre.
 */
export function apiOrigin(): string | null {
  const url = getServerEnv().MOTORBOX_ISSUER ?? publicEnv.NEXT_PUBLIC_APP_URL;
  if (!url) return null;
  // Sin barra final: se compara con `===` del otro lado.
  return url.replace(/\/+$/, "");
}

/** Origen del host embebido de Motorbox (`motorbox.apicrm.ai`). */
export function embedOrigin(): string | null {
  const url = publicEnv.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

/** Origen público de Motorbox (`www.motorbox.ai`), para el endpoint de avisos. */
export function publicOrigin(): string | null {
  const url = getServerEnv().MOTORBOX_PUBLIC_ORIGIN;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export type MotorboxReadiness = {
  /** ¿Podemos emitir tickets y mostrar el iframe? */
  ok: boolean;
  /** Qué falta, para poder decirlo en pantalla en vez de fallar en silencio. */
  missing: string[];
};

/**
 * ¿Está la integración configurada? Lo usan la página del iframe (para mostrar
 * un estado claro en vez de un iframe vacío) y el endpoint del ticket.
 *
 * Ojo con `NEXT_PUBLIC_APP_URL`: en dev apunta a localhost, y un ticket con
 * `iss` de localhost es rechazado por Motorbox. Por eso se valida que sea el
 * origen real cuando estamos en producción.
 */
export function motorboxReady(): MotorboxReadiness {
  const env = getServerEnv();
  const missing: string[] = [];

  if (!env.MOTORBOX_JWT_PRIVATE_KEY_B64) missing.push("MOTORBOX_JWT_PRIVATE_KEY_B64");
  if (!env.MOTORBOX_JWT_PUBLIC_KEY_B64) missing.push("MOTORBOX_JWT_PUBLIC_KEY_B64");
  if (!env.MOTORBOX_JWT_KID) missing.push("MOTORBOX_JWT_KID");
  if (!apiOrigin()) missing.push("MOTORBOX_ISSUER (o NEXT_PUBLIC_APP_URL)");
  if (!embedOrigin()) missing.push("NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN");

  if (env.NODE_ENV === "production" && apiOrigin()?.includes("localhost")) {
    missing.push("MOTORBOX_ISSUER (apunta a localhost en producción)");
  }

  return { ok: missing.length === 0, missing };
}

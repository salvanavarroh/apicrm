import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import type { Profile, UserRole } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import {
  MOTORBOX_AUDIENCE,
  TICKET_TTL_SECONDS,
  apiOrigin,
  embedOrigin,
} from "@/lib/motorbox/config";
import { getPrivateKey } from "@/lib/motorbox/keys";

// ============================================================================
// El ticket SSO.
//
// Un JWT firmado, de 90 segundos y un solo uso, que le dice a Motorbox quién
// entra. Motorbox lo verifica contra nuestro JWKS, consume el `jti` (anti
// replay) y abre SU PROPIA sesión. Después de eso el ticket no sirve más.
//
// Contrato completo: docs/motorbox-spec-motorbox.md §5.1. Los nombres de los
// claims son parte del contrato — no cambiarlos sin avisarle al otro equipo.
// ============================================================================

export type TicketCompany = {
  id: string;
  name: string;
  country: string | null;
  status: string;
};

/**
 * Rol de API traducido al vocabulario de Motorbox. Ellos autorizan por `scope`,
 * no por `role`: así un rol nuevo nuestro no les rompe la autorización.
 */
function scopeForRole(role: UserRole): string[] {
  // Hoy sólo entran admin y group_admin, y los dos son dueños de la vidriera.
  if (role === "admin" || role === "group_admin") return ["dealer.admin"];
  return [];
}

export type MintTicketOptions = {
  profile: Profile;
  /**
   * El email del usuario. NO está en `profiles` (vive en `auth.users`), y
   * Motorbox lo necesita sí o sí: con él crea la cuenta del lado de ellos.
   * Lo resuelve `resolveUserEmail()`.
   */
  email: string;
  company: TicketCompany;
  /** false = "abrir en pestaña nueva": Motorbox no esconde su propio chrome. */
  embed?: boolean;
  /** Ruta interna de Motorbox a la que ir después del canje. */
  state?: string;
  /** Si un super admin está impersonando, su id. Motorbox lo audita. */
  impersonatedBy?: string | null;
};

/** Firma un ticket. Devuelve el JWT serializado. */
export async function mintTicket(opts: MintTicketOptions): Promise<string> {
  const { profile, email, company, embed = true, impersonatedBy = null } = opts;
  const iss = apiOrigin();
  if (!iss) throw new Error("MOTORBOX_ISSUER no está configurada");

  const kid = getServerEnv().MOTORBOX_JWT_KID;
  if (!kid) throw new Error("MOTORBOX_JWT_KID no está configurada");

  const now = Math.floor(Date.now() / 1000);
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return new SignJWT({
    company: {
      id: company.id,
      name: company.name,
      country: company.country,
      status: company.status,
    },
    user: {
      id: profile.id,
      email,
      name: fullName || null,
      role: profile.role,
    },
    scope: scopeForRole(profile.role),
    embed,
    act: impersonatedBy ? { sub: `api_crm:profile:${impersonatedBy}` } : null,
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(iss)
    .setAudience(MOTORBOX_AUDIENCE)
    .setSubject(`api_crm:profile:${profile.id}`)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + TICKET_TTL_SECONDS)
    .sign(await getPrivateKey());
}

/**
 * Sólo rutas internas de Motorbox. Sin esto, cualquiera que pueda influir el
 * `state` manda al usuario a otro sitio con un ticket recién emitido en la URL.
 */
export function safeState(state: string | null | undefined): string {
  const fallback = "/dealer";
  if (!state) return fallback;
  if (!state.startsWith("/")) return fallback;
  // `//evil.com` y `/\evil.com` son URLs protocol-relative: no son internas.
  if (state.startsWith("//") || state.startsWith("/\\")) return fallback;
  if (!/^\/[A-Za-z0-9/_\-.?=&%]*$/.test(state)) return fallback;
  return state;
}

/** La URL completa de canje, lista para el `src` del iframe. */
export async function buildSsoUrl(opts: MintTicketOptions): Promise<string> {
  const origin = embedOrigin();
  if (!origin) throw new Error("NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN no está configurada");
  const ticket = await mintTicket(opts);
  const url = new URL(`${origin}/api/sso/api-crm`);
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("state", safeState(opts.state));
  return url.toString();
}

/**
 * El email del usuario, que vive en `auth.users` y no en `profiles`.
 *
 * Para el usuario de la sesión alcanza con `auth.getUser()`; para cualquier
 * otro (o cuando no hay sesión, como en un job) hace falta el admin client.
 */
export async function resolveUserEmail(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail, type SendEmailResult } from "./client";
import {
  invitationEmailHtml,
  invitationSubject,
  type InvitationRole,
} from "./templates/invitation";
import {
  PASSWORD_RESET_SUBJECT,
  passwordResetEmailHtml,
} from "./templates/password-reset";

// ============================================================================
// Invitación de usuarios — flujo SSR/PKCE friendly
// ============================================================================
//
// NO usamos `auth.admin.inviteUserByEmail()` (SMTP de Supabase limitado a 4/h
// en plan free + emails de noreply@mail.app.supabase.io). En cambio:
//
//   1) generateLink({type:'invite'}) → crea user en auth.users + dispara
//      handle_new_auth_user, y nos devuelve `properties.hashed_token`.
//   2) Armamos un link directo a NUESTRO endpoint /auth/confirm con
//      ?token_hash=&type=&next=. Esto NO pasa por el redirect de Supabase
//      (que usa hash fragments # que no llegan al server).
//   3) /auth/confirm hace verifyOtp server-side → crea sesión SSR vía cookies.
//   4) Resend envía nuestro template branded con ese link directo.
//
// Ventajas: full control del template + sin límites SMTP de Supabase + el
// flujo es PKCE-friendly y no depende del allowlist de redirect URLs de
// Supabase Auth.

export type GenerateInvitationArgs = {
  email: string;
  metadata: Record<string, unknown>;
  appUrl: string;
  // Path donde mandar al user después de verificar el token.
  // Default: /auth/accept-invitation (setear password + T&C).
  next?: string;
};

export type GenerateInvitationResult =
  | { ok: true; userId: string; actionLink: string }
  | { ok: false; message: string };

export async function generateInvitationLink(
  supabase: SupabaseClient,
  args: GenerateInvitationArgs,
): Promise<GenerateInvitationResult> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: args.email.toLowerCase().trim(),
    options: {
      data: args.metadata,
      // Fallback de Supabase — no lo usamos porque armamos URL custom abajo,
      // pero lo dejamos consistente por si algún día removemos el bypass.
      redirectTo: `${args.appUrl}/auth/confirm`,
    },
  });

  if (error || !data?.user || !data.properties?.hashed_token) {
    return {
      ok: false,
      message: error?.message ?? "No se pudo generar el enlace de invitación",
    };
  }

  const actionLink = buildConfirmUrl({
    appUrl: args.appUrl,
    tokenHash: data.properties.hashed_token,
    type: "invite",
    next: args.next ?? "/auth/accept-invitation",
  });

  return { ok: true, userId: data.user.id, actionLink };
}

// Re-invitación: para un usuario que YA existe (ej. quedó pending porque
// rebotó el mail). `generateLink({type:'invite'})` falla si el user existe, así
// que usamos 'recovery' y lo mandamos igual al flujo de aceptar invitación.
export async function generateReinviteLink(
  supabase: SupabaseClient,
  args: { email: string; appUrl: string },
): Promise<GenerateInvitationResult> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: args.email.toLowerCase().trim(),
    options: { redirectTo: `${args.appUrl}/auth/confirm` },
  });

  if (error || !data?.user || !data.properties?.hashed_token) {
    return {
      ok: false,
      message: error?.message ?? "No se pudo generar el enlace",
    };
  }

  const actionLink = buildConfirmUrl({
    appUrl: args.appUrl,
    tokenHash: data.properties.hashed_token,
    type: "recovery",
    next: "/auth/accept-invitation",
  });
  return { ok: true, userId: data.user.id, actionLink };
}

export type SendInvitationArgs = {
  to: string;
  firstName: string;
  companyName: string;
  role: InvitationRole;
  actionLink: string;
};

export function sendInvitationEmail(
  args: SendInvitationArgs,
): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: invitationSubject({ companyName: args.companyName }),
    html: invitationEmailHtml({
      firstName: args.firstName,
      companyName: args.companyName,
      role: args.role,
      actionLink: args.actionLink,
    }),
  });
}

// Conveniencia: crea el user + manda el email en un solo paso. Si el email
// falla, hace rollback borrando el user creado para que la operación sea
// atómica.
export async function inviteUserAtomic(
  supabase: SupabaseClient,
  args: GenerateInvitationArgs & {
    firstName: string;
    companyName: string;
    role: InvitationRole;
  },
): Promise<
  | { ok: true; userId: string; actionLink: string; messageId: string }
  | { ok: false; message: string }
> {
  const link = await generateInvitationLink(supabase, args);
  if (!link.ok) return link;

  const email = await sendInvitationEmail({
    to: args.email,
    firstName: args.firstName,
    companyName: args.companyName,
    role: args.role,
    actionLink: link.actionLink,
  });

  if (!email.ok) {
    await supabase.auth.admin.deleteUser(link.userId);
    return {
      ok: false,
      message: `No se pudo enviar el email: ${email.message}`,
    };
  }

  return {
    ok: true,
    userId: link.userId,
    actionLink: link.actionLink,
    messageId: email.id,
  };
}

// ============================================================================
// Recuperación de contraseña
// ============================================================================

export async function generatePasswordResetLink(
  supabase: SupabaseClient,
  args: { email: string; appUrl: string; next?: string },
): Promise<
  | { ok: true; actionLink: string }
  | { ok: false; message: string }
> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: args.email.toLowerCase().trim(),
    options: { redirectTo: `${args.appUrl}/auth/confirm` },
  });

  if (error || !data?.properties?.hashed_token) {
    return {
      ok: false,
      message: error?.message ?? "No se pudo generar el enlace",
    };
  }

  const actionLink = buildConfirmUrl({
    appUrl: args.appUrl,
    tokenHash: data.properties.hashed_token,
    type: "recovery",
    next: args.next ?? "/auth/reset-password",
  });
  return { ok: true, actionLink };
}

export function sendPasswordResetEmail(args: {
  to: string;
  firstName?: string;
  actionLink: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: PASSWORD_RESET_SUBJECT,
    html: passwordResetEmailHtml({
      actionLink: args.actionLink,
      firstName: args.firstName,
    }),
  });
}

// ============================================================================
// Helpers internos
// ============================================================================

function buildConfirmUrl(args: {
  appUrl: string;
  tokenHash: string;
  type: "invite" | "recovery";
  next: string;
}): string {
  const params = new URLSearchParams({
    token_hash: args.tokenHash,
    type: args.type,
    next: args.next,
  });
  return `${args.appUrl}/auth/confirm?${params.toString()}`;
}

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
// Invitación de usuarios
// ============================================================================
//
// El flujo nuevo NO usa `auth.admin.inviteUserByEmail()` (que dispara el email
// por el SMTP de Supabase, limitado a 4/h en plan free). En cambio:
//
//   1) generateLink({type:'invite'}) → crea el user en auth.users, dispara el
//      trigger handle_new_auth_user que arma el profile, y devuelve el
//      action_link SIN enviar email.
//   2) Resend envía nuestro template branded con ese action_link.
//
// Eso nos da: full control del template, sin límites de Supabase SMTP, y los
// emails llegan desde nuestro dominio (RESEND_FROM_EMAIL).

export type GenerateInvitationArgs = {
  email: string;
  metadata: Record<string, unknown>;
  redirectTo: string;
};

export type GenerateInvitationResult =
  | { ok: true; userId: string; actionLink: string }
  | { ok: false; message: string };

export async function generateInvitationLink(
  // Uso SupabaseClient sin tipar Database porque admin.generateLink es de
  // GoTrueAdminApi, mismo shape en cualquier instancia.
  supabase: SupabaseClient,
  args: GenerateInvitationArgs,
): Promise<GenerateInvitationResult> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: args.email.toLowerCase().trim(),
    options: {
      data: args.metadata,
      redirectTo: args.redirectTo,
    },
  });

  if (error || !data?.user || !data.properties?.action_link) {
    return {
      ok: false,
      message: error?.message ?? "No se pudo generar el enlace de invitación",
    };
  }

  return {
    ok: true,
    userId: data.user.id,
    actionLink: data.properties.action_link,
  };
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
// atómica (el caller no se queda con un user en pending sin enlace activo).
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
  args: { email: string; redirectTo: string },
): Promise<
  | { ok: true; actionLink: string }
  | { ok: false; message: string }
> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: args.email.toLowerCase().trim(),
    options: { redirectTo: args.redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return {
      ok: false,
      message: error?.message ?? "No se pudo generar el enlace",
    };
  }
  return { ok: true, actionLink: data.properties.action_link };
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

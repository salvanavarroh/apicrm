"use server";

import { z } from "zod";

import {
  generatePasswordResetLink,
  sendPasswordResetEmail,
} from "@/lib/email/invitations";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

export type ForgotPasswordState = {
  error?: string;
  sentTo?: string;
};

export async function requestPasswordReset(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email inválido" };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = createAdminClient();

  // Privacidad: nunca revelamos si el email existe. Si el user no existe o
  // el envío falla, igual devolvemos sentTo (logueamos del lado server).
  const link = await generatePasswordResetLink(supabase, {
    email,
    redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password`,
  });

  if (!link.ok) {
    console.warn("generatePasswordResetLink error:", link.message);
    return { sentTo: email };
  }

  const result = await sendPasswordResetEmail({
    to: email,
    actionLink: link.actionLink,
  });

  if (!result.ok) {
    console.warn("sendPasswordResetEmail error:", result.message);
  }

  return { sentTo: email };
}

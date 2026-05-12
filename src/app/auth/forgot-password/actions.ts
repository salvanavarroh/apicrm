"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Por privacidad: el endpoint no revela si el email existe. Si falla,
  // devolvemos "sentTo" igual y logueamos del lado server.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password` },
  );
  if (error) {
    console.warn("resetPasswordForEmail error:", error.message);
  }

  return { sentTo: parsed.data.email };
}

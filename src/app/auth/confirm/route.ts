import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Confirmación de OTP por email (invitaciones + recovery).
 *
 * Recibe `?token_hash=...&type=invite|recovery&next=...` desde los templates
 * de email enviados por Resend. Usamos `verifyOtp` server-side (PKCE-friendly)
 * para no depender del redirect implícito de Supabase con `#access_token=...`
 * que no llega al server.
 *
 * Flujo:
 *   1) Validar token_hash + type
 *   2) verifyOtp crea la sesión (cookies SSR)
 *   3) Redirigir según estado del profile:
 *      - status pending  → /auth/accept-invitation
 *      - status active   → next o /
 *      - sin profile     → /login con error
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/login?toast=Link%20inv%C3%A1lido&type=error", url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    const toast = encodeURIComponent(
      "No pudimos validar el enlace: " + error.message,
    );
    return NextResponse.redirect(
      new URL(`/login?toast=${toast}&type=error`, url),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const toast = encodeURIComponent(
      "Tu cuenta no tiene perfil asignado. Contactá al SuperAdmin.",
    );
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(`/login?toast=${toast}&type=error`, url),
    );
  }

  if (profile.status === "pending") {
    return NextResponse.redirect(new URL("/auth/accept-invitation", url));
  }

  return NextResponse.redirect(new URL(next, url));
}

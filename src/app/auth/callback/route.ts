import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Callback de Supabase Auth.
 *
 * Recibe `?code=...` cuando el user hace click en el magic link de:
 *   - invitación (`inviteUserByEmail`)
 *   - recuperación de password
 *   - OAuth (cuando lo agreguemos)
 *
 * Intercambia el code por sesión y redirige según el estado del profile:
 *   - profile.status = 'pending' → /auth/accept-invitation (setear password + T&C)
 *   - profile.status = 'active'  → /  (router por rol)
 *   - sin profile → /login (caso raro: trigger falló o user nunca completó)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?toast=Link%20inv%C3%A1lido&type=error", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const toast = encodeURIComponent("No pudimos validar el enlace: " + error.message);
    return NextResponse.redirect(
      new URL(`/login?toast=${toast}&type=error`, url),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Sin profile: el trigger no creó nada (raw_user_meta_data sin role).
    // Lo mandamos a /login con un error para no dejarlo en limbo.
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

  return NextResponse.redirect(new URL(next ?? "/", url));
}

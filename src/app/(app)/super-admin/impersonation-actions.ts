"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { homePathForRole, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Cookie httpOnly donde guardamos la sesión original del super_admin mientras
// está "viendo como" otro usuario, para poder restaurarla al salir.
const ORIGIN_COOKIE = "impersonation_origin";

type ActionResult = { ok: false; message: string };

/**
 * Super_admin inicia sesión efectiva como otro usuario (admin/gerente/etc.).
 * RLS aplica como ese usuario. Queda registrado en impersonation_log.
 */
export async function impersonateUser(
  targetUserId: string,
): Promise<ActionResult> {
  const me = await requireRole(["super_admin"]);
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target || target.role === "super_admin") {
    return { ok: false, message: "Usuario no válido para impersonar" };
  }

  const { data: userRes } = await admin.auth.admin.getUserById(targetUserId);
  const email = userRes.user?.email;
  if (!email) {
    return { ok: false, message: "El usuario no tiene email" };
  }

  const supabase = await createClient();

  // Capturamos la sesión actual del super_admin ANTES de cambiarla.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, message: "No se encontró tu sesión" };
  }

  // Magic link del target → verifyOtp server-side setea las cookies de sesión
  // del usuario impersonado.
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return {
      ok: false,
      message: linkErr?.message ?? "No se pudo generar el acceso",
    };
  }

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr) {
    return { ok: false, message: verifyErr.message };
  }

  const jar = await cookies();
  jar.set(
    ORIGIN_COOKIE,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      super_admin_id: me.id,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  );

  await admin.from("impersonation_log").insert({
    super_admin_id: me.id,
    target_user_id: targetUserId,
  });

  redirect(homePathForRole(target.role));
}

/**
 * Restaura la sesión del super_admin y cierra el registro de impersonación.
 */
export async function stopImpersonation(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(ORIGIN_COOKIE)?.value;
  if (!raw) redirect("/");

  let origin: {
    access_token: string;
    refresh_token: string;
    super_admin_id?: string;
  };
  try {
    origin = JSON.parse(raw!);
  } catch {
    jar.delete(ORIGIN_COOKIE);
    redirect("/login");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: origin!.access_token,
    refresh_token: origin!.refresh_token,
  });
  jar.delete(ORIGIN_COOKIE);

  if (origin!.super_admin_id) {
    const admin = createAdminClient();
    const { data: open } = await admin
      .from("impersonation_log")
      .select("id")
      .eq("super_admin_id", origin!.super_admin_id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) {
      await admin
        .from("impersonation_log")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", open.id);
    }
  }

  if (error) redirect("/login");
  redirect("/super-admin");
}

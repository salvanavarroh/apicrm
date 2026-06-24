import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Enums"]["user_role"];

/**
 * Devuelve el profile del user autenticado, o null si no hay sesión / no hay
 * profile asociado. Memoizado por request con React.cache.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return profile;
});

/**
 * Garantiza un profile activo. Sin sesión → /login. Pending → /auth/accept-invitation.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "pending") redirect("/auth/accept-invitation");
  return profile;
}

/**
 * Como requireProfile, pero además exige uno de los roles dados.
 * Útil para rutas restringidas (ej: /super-admin).
 */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}

/**
 * Ruta a la que llevar a un user recién autenticado, según su rol.
 */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "admin":
      return "/admin";
    case "manager":
    case "supervisor":
      // El Supervisor reutiliza las pantallas del gerente.
      return "/manager";
    case "sales":
      return "/sales";
    case "data_provider":
      return "/data-provider";
  }
}

/**
 * Gerente "efectivo" del usuario: para un manager es su propio id; para un
 * supervisor (sub-gerente) es el id de su gerente padre (manager_id). Para
 * cualquier otro rol, su propio id. Es el espejo en app-layer de la función
 * SQL `acting_manager_id()` usada en las policies RLS.
 */
export function actingManagerId(profile: Profile): string {
  if (profile.role === "supervisor" && profile.manager_id) {
    return profile.manager_id;
  }
  return profile.id;
}

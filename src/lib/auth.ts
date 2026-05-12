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
    case "manager":
    case "sales":
    case "data_provider":
      return "/dashboard";
  }
}

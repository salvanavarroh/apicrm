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

  if (!profile) return null;

  // ---------------------------------------------------------------------
  // Admin de grupo: se le completa `company_id` con la MARCA ACTIVA.
  //
  // Es el espejo en app-layer de la función SQL `current_company_id()`. Con
  // esto, las ~200 consultas que hacen `.eq("company_id", profile.company_id)`
  // funcionan sin cambios: el admin de grupo es un Admin de la marca que tiene
  // seleccionada. La marca activa se lee de `group_admin_state`, la misma tabla
  // que valida Postgres, así que app y RLS nunca pueden discrepar.
  //
  // Si todavía no eligió marca, `company_id` queda null y no ve datos de
  // ninguna: el default es no ver nada, y el selector obliga a elegir.
  // ---------------------------------------------------------------------
  if (profile.role === "group_admin" && profile.group_id) {
    const { data: state } = await supabase
      .from("group_admin_state")
      .select("active_company_id")
      .eq("user_id", profile.id)
      .maybeSingle();
    return { ...profile, company_id: state?.active_company_id ?? null };
  }

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
  if (!hasRole(profile, roles)) redirect("/");
  return profile;
}

/**
 * ¿El profile cumple con alguno de los roles pedidos?
 *
 * Un `group_admin` cumple donde se pide `admin`: dentro de la marca activa es un
 * Admin con todas las facultades (decisión del cliente multimarca). Es el mismo
 * criterio que aplica `current_role()` en las policies, y tenerlo en una sola
 * función evita que app y base opinen distinto.
 */
export function hasRole(profile: Profile, roles: UserRole[]): boolean {
  if (roles.includes(profile.role)) return true;
  return profile.role === "group_admin" && roles.includes("admin");
}

/**
 * Ruta a la que llevar a un user recién autenticado, según su rol.
 */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "group_admin":
      // Su casa es el consolidado del grupo; de ahí entra a cada marca.
      return "/group";
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

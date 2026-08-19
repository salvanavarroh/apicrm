// ============================================================================
// Contexto de grupo del usuario: qué marcas tiene y cuál está activa.
//
// La marca activa vive en `group_admin_state` (base, no cookie) porque es el
// dato que Postgres usa en `current_company_id()` para resolver el scope de RLS.
// Con una cookie habría dos fuentes de verdad y la del cliente sería falsificable.
// ============================================================================

import { cache } from "react";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type GroupBrand = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type GroupContext = {
  groupId: string;
  groupName: string;
  brands: GroupBrand[];
  activeCompanyId: string | null;
};

/**
 * Contexto del admin de grupo, o null si el usuario no es uno.
 *
 * Si todavía no tiene marca activa le deja la primera: sin marca activa
 * `current_company_id()` devuelve null y no vería nada en ninguna pantalla.
 * Se hace acá porque el sidebar se renderiza en todas las rutas.
 */
export const loadGroupContext = cache(async (): Promise<GroupContext | null> => {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "group_admin" || !profile.group_id) return null;

  const supabase = await createClient();
  const [{ data: group }, { data: companies }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", profile.group_id).maybeSingle(),
    supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("group_id", profile.group_id)
      .order("name"),
  ]);

  const brands: GroupBrand[] = (companies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    logoUrl: c.logo_url,
  }));

  // `getCurrentProfile` ya devuelve company_id = marca activa.
  let activeCompanyId = profile.company_id;
  if (!activeCompanyId && brands.length > 0) {
    const first = brands[0].id;
    const { error } = await supabase
      .from("group_admin_state")
      .upsert({ user_id: profile.id, active_company_id: first });
    if (!error) activeCompanyId = first;
  }

  return {
    groupId: profile.group_id,
    groupName: group?.name ?? "Grupo",
    brands,
    activeCompanyId,
  };
});

/**
 * Ids de las concesionarias del grupo del usuario. Para las pantallas
 * consolidadas, que no pasan por RLS (leen con service_role acotado a esta
 * lista, mismo patrón que el informe de ads).
 */
export async function groupCompanyIds(groupId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("group_id", groupId);
  return (data ?? []).map((c) => c.id);
}

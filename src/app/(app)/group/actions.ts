"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Cambia la marca activa del admin de grupo.
 *
 * Escribe con el cliente del usuario a propósito: la policy de
 * `group_admin_state` sólo acepta marcas del grupo del usuario, así que la
 * validación la hace Postgres y no depende de que este action la recuerde.
 * `current_company_id()` vuelve a validar la pertenencia al resolver el scope,
 * así que hay dos candados independientes.
 */
export async function setActiveCompany(companyId: string): Promise<Result> {
  const profile = await requireProfile();
  if (profile.role !== "group_admin" || !profile.group_id) {
    return { ok: false, message: "Sólo el admin del grupo cambia de marca" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_admin_state")
    .upsert({ user_id: profile.id, active_company_id: companyId })
    .select("active_company_id")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "Esa marca no pertenece a tu grupo",
    };
  }

  // Cambia el scope de TODA la app: hay que invalidar el layout completo.
  revalidatePath("/", "layout");
  return { ok: true };
}

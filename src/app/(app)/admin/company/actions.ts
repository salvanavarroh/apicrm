"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  logo_url: z
    .string()
    .url("URL inválida")
    .optional()
    .or(z.literal("")),
});

export type UpdateCompanyState = {
  fieldErrors?: Record<string, string>;
  formError?: string;
  success?: boolean;
};

/**
 * Server action invocada directamente desde el modal de edición.
 * (Mantengo también la versión con useActionState para casos sin modal.)
 */
export async function saveCompanyOperational(
  input: z.input<typeof schema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      logo_url: parsed.data.logo_url || null,
    })
    .eq("id", profile.company_id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/company");
  return { ok: true };
}

/** Compat: server action con useActionState — la dejo por si la necesitamos. */
export async function updateOperationalCompany(
  _prev: UpdateCompanyState | undefined,
  formData: FormData,
): Promise<UpdateCompanyState> {
  const result = await saveCompanyOperational({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    logo_url: String(formData.get("logo_url") ?? ""),
  });
  if (!result.ok) return { formError: result.message };
  return { success: true };
}

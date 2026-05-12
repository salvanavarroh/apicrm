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

export async function updateOperationalCompany(
  _prev: UpdateCompanyState | undefined,
  formData: FormData,
): Promise<UpdateCompanyState> {
  const profile = await requireRole(["admin"]);

  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    logo_url: formData.get("logo_url"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  if (!profile.company_id) {
    return { formError: "No tenés empresa asignada" };
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

  if (error) {
    return { formError: error.message };
  }

  revalidatePath("/admin/company");
  return { success: true };
}

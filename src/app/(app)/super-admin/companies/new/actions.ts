"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  company: z.object({
    name: z.string().min(2, "El nombre es obligatorio"),
    legal_name: z.string().optional().or(z.literal("")),
    cuit: z.string().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    address: z.string().optional().or(z.literal("")),
    monthly_price: z
      .union([z.coerce.number().nonnegative(), z.literal("")])
      .optional(),
    subscription_ends_at: z.string().optional().or(z.literal("")),
  }),
  admin: z.object({
    email: z.string().email("Email del Admin inválido"),
    first_name: z.string().min(1, "Nombre del Admin obligatorio"),
    last_name: z.string().min(1, "Apellido del Admin obligatorio"),
  }),
});

export type CreateCompanyState = {
  fieldErrors?: Record<string, string>;
  formError?: string;
};

function emptyToNull<T extends string | number | undefined>(value: T) {
  if (value === "" || value === undefined) return null;
  return value;
}

export async function createCompanyWithAdmin(
  _prev: CreateCompanyState | undefined,
  formData: FormData,
): Promise<CreateCompanyState> {
  await requireRole(["super_admin"]);

  const parsed = schema.safeParse({
    company: {
      name: formData.get("company.name"),
      legal_name: formData.get("company.legal_name"),
      cuit: formData.get("company.cuit"),
      phone: formData.get("company.phone"),
      address: formData.get("company.address"),
      monthly_price: formData.get("company.monthly_price"),
      subscription_ends_at: formData.get("company.subscription_ends_at"),
    },
    admin: {
      email: formData.get("admin.email"),
      first_name: formData.get("admin.first_name"),
      last_name: formData.get("admin.last_name"),
    },
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const { company, admin } = parsed.data;
  const supabase = createAdminClient();

  // 1) Insert empresa
  const { data: created, error: insertErr } = await supabase
    .from("companies")
    .insert({
      name: company.name.trim(),
      legal_name: emptyToNull(company.legal_name) as string | null,
      cuit: emptyToNull(company.cuit) as string | null,
      phone: emptyToNull(company.phone) as string | null,
      address: emptyToNull(company.address) as string | null,
      monthly_price: emptyToNull(company.monthly_price) as number | null,
      subscription_ends_at: emptyToNull(company.subscription_ends_at) as
        | string
        | null,
      status: "pending",
    })
    .select("id, name")
    .single();

  if (insertErr || !created) {
    return { formError: insertErr?.message ?? "No se pudo crear la empresa" };
  }

  // 2) Invitar al Admin. El trigger handle_new_auth_user lee raw_user_meta_data
  // y crea el profile con role=admin, company_id, first/last_name.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    admin.email.toLowerCase().trim(),
    {
      data: {
        role: "admin",
        company_id: created.id,
        first_name: admin.first_name.trim(),
        last_name: admin.last_name.trim(),
      },
      redirectTo: `${appUrl}/auth/callback`,
    },
  );

  if (inviteErr) {
    // Rollback: si no pudimos invitar al admin, borramos la empresa para
    // no dejar empresas huérfanas. Si el delete falla, lo logueamos.
    await supabase.from("companies").delete().eq("id", created.id);
    return {
      formError: `Empresa no creada: ${inviteErr.message}. Probá con otro email del Admin.`,
    };
  }

  revalidatePath("/super-admin");

  const toast = encodeURIComponent(
    `Empresa "${created.name}" creada. Invitación enviada a ${admin.email}.`,
  );
  redirect(`/super-admin?toast=${toast}&type=success`);
}

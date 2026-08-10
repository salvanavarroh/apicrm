"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

const branchSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(2, "Nombre obligatorio"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

export type CreateBranchInput = z.input<typeof branchSchema>;

export async function createBranchAsSuperAdmin(
  input: CreateBranchInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["super_admin"]);
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const supabase = createAdminClient();
  const fullAddress = [parsed.data.address, parsed.data.city]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(", ");
  const { error } = await supabase.from("branches").insert({
    company_id: parsed.data.company_id,
    name: parsed.data.name.trim(),
    address: fullAddress || null,
    phone: parsed.data.phone || null,
    status: "active",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/super-admin/companies/${parsed.data.company_id}`);
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

export async function deleteBranchAsSuperAdmin(
  branchId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["super_admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase.from("branches").delete().eq("id", branchId);
  if (error) {
    // FK restrict (ej. leads colgando de la sucursal) → mensaje claro.
    return {
      ok: false,
      message:
        "No se pudo eliminar. Puede tener leads, gerencias o usuarios asociados.",
    };
  }
  revalidatePath(`/super-admin/companies/${companyId}`);
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

const updateCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  legal_name: z.string().optional().or(z.literal("")),
  cuit: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  logo_url: z.string().url().optional().or(z.literal("")),
  plan: z.enum(["inicial", "estandar", "personalizado"]).nullable().optional(),
  monthly_price: z
    .union([z.coerce.number().nonnegative(), z.literal("")])
    .optional(),
  subscription_starts_at: z.string().optional().or(z.literal("")),
  subscription_ends_at: z.string().optional().or(z.literal("")),
  status: z.enum(["pending", "active", "suspended"]).optional(),
});

export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;

export async function updateCompanyAsSuperAdmin(
  input: UpdateCompanyInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["super_admin"]);
  const parsed = updateCompanySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const supabase = createAdminClient();
  const payload: CompanyUpdate = {
    name: parsed.data.name.trim(),
    legal_name: parsed.data.legal_name || null,
    cuit: parsed.data.cuit || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    logo_url: parsed.data.logo_url || null,
    plan: parsed.data.plan ?? null,
    monthly_price:
      parsed.data.monthly_price === "" || parsed.data.monthly_price === undefined
        ? null
        : Number(parsed.data.monthly_price),
    subscription_starts_at: parsed.data.subscription_starts_at || null,
    subscription_ends_at: parsed.data.subscription_ends_at || null,
  };
  if (parsed.data.status) payload.status = parsed.data.status;

  const { error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", parsed.data.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/super-admin/companies/${parsed.data.id}`);
  revalidatePath("/super-admin/companies");
  revalidatePath("/super-admin");
  return { ok: true };
}

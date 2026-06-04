"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  company: z.object({
    name: z.string().min(2),
    address: z.string().optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
  }),
  billing: z.object({
    cuit: z.string().optional().or(z.literal("")),
    legal_name: z.string().optional().or(z.literal("")),
    monthly_price: z
      .union([z.coerce.number().nonnegative(), z.literal("")])
      .optional(),
    subscription_starts_at: z.string().optional().or(z.literal("")),
    subscription_ends_at: z.string().optional().or(z.literal("")),
  }),
  admin: z.object({
    email: z.string().email(),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    phone: z.string().optional().or(z.literal("")),
  }),
});

export type CreateCompanyInput = z.input<typeof inputSchema>;
export type CreateCompanyResult =
  | { ok: true; companyName: string; adminEmail: string }
  | { ok: false; message: string };

function emptyToNull<T extends string | number | undefined>(value: T) {
  if (value === "" || value === undefined) return null;
  return value;
}

export async function createCompanyWithAdmin(
  raw: CreateCompanyInput,
): Promise<CreateCompanyResult> {
  await requireRole(["super_admin"]);

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }
  const { company, billing, admin } = parsed.data;

  const supabase = createAdminClient();

  // El schema actual guarda address (no city por separado). En MVP unimos
  // city + address en `address` (city al final). Si más adelante se separa,
  // creamos columnas.
  const fullAddress = [company.address, company.city]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(", ");

  const { data: created, error: insertErr } = await supabase
    .from("companies")
    .insert({
      name: company.name.trim(),
      address: fullAddress || null,
      phone: emptyToNull(company.phone) as string | null,
      legal_name: emptyToNull(billing.legal_name) as string | null,
      cuit: emptyToNull(billing.cuit) as string | null,
      monthly_price: emptyToNull(billing.monthly_price) as number | null,
      subscription_starts_at: emptyToNull(billing.subscription_starts_at) as
        | string
        | null,
      subscription_ends_at: emptyToNull(billing.subscription_ends_at) as
        | string
        | null,
      // SuperAdmin crea la empresa = ya hizo el KYC manualmente. Arrancan
      // activas directamente para que el dealer pueda operar sin un paso
      // extra de "activación".
      status: "active",
    })
    .select("id, name")
    .single();

  if (insertErr || !created) {
    return {
      ok: false,
      message: insertErr?.message ?? "No se pudo crear la concesionaria",
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    admin.email.toLowerCase().trim(),
    {
      data: {
        role: "admin",
        company_id: created.id,
        first_name: admin.first_name.trim(),
        last_name: admin.last_name.trim(),
        phone: emptyToNull(admin.phone),
      },
      redirectTo: `${appUrl}/auth/callback`,
    },
  );

  if (inviteErr) {
    await supabase.from("companies").delete().eq("id", created.id);
    return {
      ok: false,
      message: `${inviteErr.message}. Probá con otro email del Admin.`,
    };
  }

  revalidatePath("/super-admin/companies");

  return {
    ok: true,
    companyName: created.name,
    adminEmail: admin.email,
  };
}

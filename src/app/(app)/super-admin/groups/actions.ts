"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { inviteUserAtomic } from "@/lib/email/invitations";
import { createAdminClient } from "@/lib/supabase/admin";

// Grupos concesionarios: alta, asignación de marcas y admin del grupo. Todo
// SuperAdmin — el grupo es un contrato comercial.

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const groupSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  legal_name: z.string().trim().optional(),
  cuit: z.string().trim().optional(),
  monthly_price: z.coerce.number().min(0).optional(),
  billing_contact_name: z.string().trim().optional(),
  billing_email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  subscription_starts_at: z.string().optional(),
  subscription_ends_at: z.string().optional(),
  notes: z.string().trim().optional(),
});

export async function createGroup(
  raw: z.input<typeof groupSchema>,
): Promise<Result<{ groupId: string }>> {
  await requireRole(["super_admin"]);
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .insert({
      name: d.name,
      legal_name: emptyToNull(d.legal_name) as string | null,
      cuit: emptyToNull(d.cuit) as string | null,
      monthly_price: d.monthly_price ?? 0,
      billing_contact_name: emptyToNull(d.billing_contact_name) as string | null,
      billing_email: emptyToNull(d.billing_email) as string | null,
      subscription_starts_at: emptyToNull(d.subscription_starts_at) as string | null,
      subscription_ends_at: emptyToNull(d.subscription_ends_at) as string | null,
      notes: emptyToNull(d.notes) as string | null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "No se pudo crear el grupo" };
  }
  revalidatePath("/super-admin/groups");
  return { ok: true, groupId: data.id };
}

export async function updateGroup(
  groupId: string,
  raw: z.input<typeof groupSchema>,
): Promise<Result> {
  await requireRole(["super_admin"]);
  const parsed = groupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin
    .from("groups")
    .update({
      name: d.name,
      legal_name: emptyToNull(d.legal_name) as string | null,
      cuit: emptyToNull(d.cuit) as string | null,
      monthly_price: d.monthly_price ?? 0,
      billing_contact_name: emptyToNull(d.billing_contact_name) as string | null,
      billing_email: emptyToNull(d.billing_email) as string | null,
      subscription_starts_at: emptyToNull(d.subscription_starts_at) as string | null,
      subscription_ends_at: emptyToNull(d.subscription_ends_at) as string | null,
      notes: emptyToNull(d.notes) as string | null,
    })
    .eq("id", groupId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/groups");
  return { ok: true };
}

/**
 * Mete o saca una marca del grupo.
 *
 * Al entrar al grupo el precio propio de la marca se pone en 0: el contrato pasa
 * a ser del grupo y dejar los dos importes cargados haría que la facturación
 * cuente dos veces lo mismo.
 */
export async function setCompanyGroup(
  companyId: string,
  groupId: string | null,
): Promise<Result> {
  await requireRole(["super_admin"]);
  const admin = createAdminClient();

  const { error } = await admin
    .from("companies")
    .update(
      groupId
        ? { group_id: groupId, monthly_price: 0 }
        : { group_id: null },
    )
    .eq("id", companyId);
  if (error) return { ok: false, message: error.message };

  // Si la marca sale del grupo y algún admin de grupo la tenía activa, ese
  // estado queda apuntando a una marca que ya no es del grupo. La función
  // current_company_id() no la resolvería (el join la descarta), pero dejarlo
  // sucio confunde: se limpia.
  if (!groupId) {
    await admin
      .from("group_admin_state")
      .update({ active_company_id: null })
      .eq("active_company_id", companyId);
  }

  revalidatePath("/super-admin/groups");
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

const adminSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  first_name: z.string().trim().min(1, "Falta el nombre"),
  last_name: z.string().trim().min(1, "Falta el apellido"),
  phone: z.string().trim().optional(),
});

/** Invita al dueño del grupo: una sola cuenta con acceso a todas sus marcas. */
export async function inviteGroupAdmin(
  groupId: string,
  raw: z.input<typeof adminSchema>,
): Promise<Result<{ email: string }>> {
  await requireRole(["super_admin"]);
  const parsed = adminSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: group } = await admin
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { ok: false, message: "El grupo no existe" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const invite = await inviteUserAtomic(admin, {
    email: d.email,
    metadata: {
      role: "group_admin",
      // Sin company_id: el admin de grupo pertenece al GRUPO. El trigger
      // handle_new_auth_user ya sabe leer group_id.
      group_id: group.id,
      first_name: d.first_name,
      last_name: d.last_name,
      phone: emptyToNull(d.phone),
    },
    appUrl,
    firstName: d.first_name,
    companyName: group.name,
    role: "group_admin",
  });
  if (!invite.ok) return { ok: false, message: invite.message };

  revalidatePath("/super-admin/groups");
  return { ok: true, email: d.email };
}

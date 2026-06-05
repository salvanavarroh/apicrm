"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  generateInvitationLink,
  sendInvitationEmail,
} from "@/lib/email/invitations";
import { createAdminClient } from "@/lib/supabase/admin";

const baseSchema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio"),
  last_name: z.string().min(1, "Apellido obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().or(z.literal("")),
});

const inviteSchema = z.discriminatedUnion("role", [
  baseSchema.extend({ role: z.literal("admin") }),
  baseSchema.extend({ role: z.literal("data_provider") }),
  baseSchema.extend({
    role: z.literal("manager"),
    branch_ids: z.array(z.string().uuid()).min(1, "Al menos una sucursal"),
    product_type_ids: z
      .array(z.string().uuid())
      .min(1, "Al menos un tipo de producto"),
  }),
]);

export type InviteUserInput = z.input<typeof inviteSchema>;
export type InviteUserResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export async function inviteUser(
  raw: InviteUserInput,
): Promise<InviteUserResult> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 1) Validar que no haya conflictos previos (en caso de Manager: que cada
  // combinación branch+product_type no tenga otro manager ya asignado).
  if (parsed.data.role === "manager") {
    const { data: clashes } = await supabase
      .from("managements")
      .select("branch_id, product_type_id")
      .in("branch_id", parsed.data.branch_ids)
      .in("product_type_id", parsed.data.product_type_ids);
    if (clashes && clashes.length > 0) {
      return {
        ok: false,
        message:
          "Alguna combinación de sucursal y tipo de producto ya tiene gerente asignado",
      };
    }
  }

  // 2) Crear el user vía generateLink (NO envía email — eso lo hacemos al
  // final con Resend). El trigger handle_new_auth_user lee raw_user_meta_data
  // y crea el profile (status=pending) con role/company_id/first_name/last_name/phone.
  const link = await generateInvitationLink(supabase, {
    email: parsed.data.email,
    metadata: {
      role: parsed.data.role,
      company_id: profile.company_id,
      first_name: parsed.data.first_name.trim(),
      last_name: parsed.data.last_name.trim(),
      phone: parsed.data.phone || null,
    },
    redirectTo: `${appUrl}/auth/callback`,
  });

  if (!link.ok) {
    return { ok: false, message: link.message };
  }

  const newUserId = link.userId;

  // 3) Si es Manager: crear user_product_types + managements.
  if (parsed.data.role === "manager") {
    const { branch_ids, product_type_ids } = parsed.data;
    const companyId = profile.company_id;

    const userProductRows = product_type_ids.map((pt) => ({
      user_id: newUserId,
      product_type_id: pt,
    }));
    const { error: uptErr } = await supabase
      .from("user_product_types")
      .insert(userProductRows);
    if (uptErr) {
      // Rollback: borrar user invitado
      await supabase.auth.admin.deleteUser(newUserId);
      return { ok: false, message: `Error al asignar tipos: ${uptErr.message}` };
    }

    const managementRows = branch_ids.flatMap((branch) =>
      product_type_ids.map((pt) => ({
        company_id: companyId,
        branch_id: branch,
        product_type_id: pt,
        manager_id: newUserId,
        auto_assignment_enabled: false,
      })),
    );
    const { error: mErr } = await supabase
      .from("managements")
      .insert(managementRows);
    if (mErr) {
      await supabase
        .from("user_product_types")
        .delete()
        .eq("user_id", newUserId);
      await supabase.auth.admin.deleteUser(newUserId);
      return { ok: false, message: `Error al crear gerencias: ${mErr.message}` };
    }
  }

  // 4) Email vía Resend, solo después de que toda la data downstream esté lista.
  // Si falla el email, hacemos rollback completo: la operación es atómica.
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id)
    .maybeSingle();
  const companyName = company?.name ?? "tu empresa";

  const emailResult = await sendInvitationEmail({
    to: parsed.data.email,
    firstName: parsed.data.first_name.trim(),
    companyName,
    role: parsed.data.role,
    actionLink: link.actionLink,
  });

  if (!emailResult.ok) {
    // Rollback completo: el user no recibió email, mejor cancelar todo.
    if (parsed.data.role === "manager") {
      await supabase
        .from("managements")
        .delete()
        .eq("manager_id", newUserId);
      await supabase
        .from("user_product_types")
        .delete()
        .eq("user_id", newUserId);
    }
    await supabase.auth.admin.deleteUser(newUserId);
    return {
      ok: false,
      message: `No se pudo enviar el email: ${emailResult.message}`,
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, userId: newUserId };
}

export async function toggleUserStatus(
  userId: string,
  next: "active" | "inactive",
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: next })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function softDeleteUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "deleted" })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export type UpdateProfileInput = {
  first_name: string;
  last_name: string;
  phone: string;
  branch_id: string | null;
  commission_percent: number | null;
  commission_conditions: string;
};

export async function updateUserProfile(
  userId: string,
  data: UpdateProfileInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      phone: data.phone.trim() || null,
      branch_id: data.branch_id,
      commission_percent: data.commission_percent,
      commission_conditions: data.commission_conditions.trim() || null,
    })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

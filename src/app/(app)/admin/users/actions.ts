"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
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

  // 2) Invitar al user. El trigger handle_new_auth_user lee raw_user_meta_data
  // y crea el profile (status=pending) con role/company_id/first_name/last_name/phone.
  const { data: invited, error: inviteErr } =
    await supabase.auth.admin.inviteUserByEmail(
      parsed.data.email.toLowerCase().trim(),
      {
        data: {
          role: parsed.data.role,
          company_id: profile.company_id,
          first_name: parsed.data.first_name.trim(),
          last_name: parsed.data.last_name.trim(),
          phone: parsed.data.phone || null,
        },
        redirectTo: `${appUrl}/auth/callback`,
      },
    );

  if (inviteErr || !invited?.user) {
    return {
      ok: false,
      message: inviteErr?.message ?? "No se pudo invitar al usuario",
    };
  }

  const newUserId = invited.user.id;

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

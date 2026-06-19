"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  generateInvitationLink,
  generateReinviteLink,
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
    can_export_leads: z.boolean().optional(),
  }),
  baseSchema.extend({
    role: z.literal("sales"),
    manager_id: z.string().uuid("Elegí un gerente"),
    branch_id: z.string().uuid("Elegí una sucursal"),
    product_type_ids: z
      .array(z.string().uuid())
      .min(1, "Al menos un tipo de producto"),
  }),
]);

export type InviteUserInput = z.input<typeof inviteSchema>;
export type InviteUserResult =
  | { ok: true; userId: string; emailWarning?: string }
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

  // 1) Si es Vendedor: validar que el gerente elegido sea de la empresa.
  // (Multi-gerente: ya NO validamos que la combinación sucursal+producto esté
  // libre — varias gerencias pueden compartirla.)
  if (parsed.data.role === "sales") {
    const { data: mgr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.manager_id)
      .eq("company_id", profile.company_id)
      .eq("role", "manager")
      .maybeSingle();
    if (!mgr) {
      return { ok: false, message: "El gerente seleccionado no es válido" };
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
    appUrl,
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

    // Permiso de descarga de base (default off).
    if (parsed.data.can_export_leads) {
      await supabase
        .from("profiles")
        .update({ can_export_leads: true })
        .eq("id", newUserId);
    }
  }

  // 3b) Si es Vendedor: setear gerente + sucursal + teléfono en el profile
  // (el trigger solo escribe role/empresa/nombre) y asignar tipos de producto.
  if (parsed.data.role === "sales") {
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        branch_id: parsed.data.branch_id,
        manager_id: parsed.data.manager_id,
        phone: parsed.data.phone || null,
      })
      .eq("id", newUserId);
    if (profErr) {
      await supabase.auth.admin.deleteUser(newUserId);
      return {
        ok: false,
        message: `Error al asignar gerente: ${profErr.message}`,
      };
    }

    const userProductRows = parsed.data.product_type_ids.map((pt) => ({
      user_id: newUserId,
      product_type_id: pt,
    }));
    const { error: uptErr } = await supabase
      .from("user_product_types")
      .insert(userProductRows);
    if (uptErr) {
      await supabase.auth.admin.deleteUser(newUserId);
      return { ok: false, message: `Error al asignar tipos: ${uptErr.message}` };
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

  revalidatePath("/admin/users");

  // El usuario se crea SIEMPRE (queda pending). Si el email rebota/falla, NO
  // hacemos rollback: avisamos para que se reenvíe la invitación a mano.
  if (!emailResult.ok) {
    return {
      ok: true,
      userId: newUserId,
      emailWarning: `Usuario creado, pero no se pudo enviar el email (${emailResult.message}). Reenviá la invitación.`,
    };
  }

  return { ok: true, userId: newUserId };
}

// ----------------------------------------------------------------------------
// Reenviar invitación a un usuario pendiente. Permite cambiar el email (valida
// que el nuevo no esté tomado). Útil cuando rebotó el mail original.
// ----------------------------------------------------------------------------

export async function resendInvitation(
  userId: string,
  newEmail?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // El usuario debe ser de la empresa y estar pendiente.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, first_name, status, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.company_id !== profile.company_id) {
    return { ok: false, message: "Usuario no encontrado" };
  }
  if (target.status !== "pending") {
    return { ok: false, message: "El usuario ya aceptó la invitación" };
  }

  // Email actual del usuario.
  const { data: userRes } = await supabase.auth.admin.getUserById(userId);
  let email = userRes.user?.email ?? "";

  // Cambio de email: validar que no esté tomado por otro usuario.
  const wanted = newEmail?.trim().toLowerCase();
  if (wanted && wanted !== email) {
    const emailSchema = z.string().email();
    if (!emailSchema.safeParse(wanted).success) {
      return { ok: false, message: "Email inválido" };
    }
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      email: wanted,
    });
    if (updErr) {
      // Supabase devuelve error si el email ya está registrado.
      return {
        ok: false,
        message: `No se pudo cambiar el email: ${updErr.message}`,
      };
    }
    email = wanted;
  }

  const link = await generateReinviteLink(supabase, { email, appUrl });
  if (!link.ok) {
    return { ok: false, message: link.message };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id)
    .maybeSingle();

  const emailResult = await sendInvitationEmail({
    to: email,
    firstName: target.first_name ?? "",
    companyName: company?.name ?? "tu empresa",
    role: target.role,
    actionLink: link.actionLink,
  });
  if (!emailResult.ok) {
    return {
      ok: false,
      message: `No se pudo enviar el email: ${emailResult.message}`,
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
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
  can_export_leads?: boolean;
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
      ...(data.can_export_leads !== undefined
        ? { can_export_leads: data.can_export_leads }
        : {}),
    })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

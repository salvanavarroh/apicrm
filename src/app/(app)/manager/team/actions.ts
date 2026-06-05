"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  generateInvitationLink,
  sendInvitationEmail,
} from "@/lib/email/invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio"),
  last_name: z.string().min(1, "Apellido obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().or(z.literal("")),
  branch_id: z.string().uuid("Sucursal obligatoria"),
  product_type_ids: z
    .array(z.string().uuid())
    .min(1, "Al menos un tipo de producto"),
  commission_percent: z
    .coerce.number()
    .min(0)
    .max(100, "Comisión entre 0 y 100"),
  commission_conditions: z.string().optional().or(z.literal("")),
});

export type InviteSellerInput = z.input<typeof inviteSchema>;
export type InviteSellerResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

export async function inviteSeller(
  raw: InviteSellerInput,
): Promise<InviteSellerResult> {
  const profile = await requireRole(["manager"]);
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

  // Validar que la branch y los tipos pertenezcan a una gerencia del manager.
  const supabaseSession = await createClient();
  const { data: myManagements } = await supabaseSession
    .from("managements")
    .select("branch_id, product_type_id")
    .eq("manager_id", profile.id);

  const allowedBranches = new Set(
    (myManagements ?? []).map((m) => m.branch_id),
  );
  if (!allowedBranches.has(parsed.data.branch_id)) {
    return { ok: false, message: "Esa sucursal no está en tus gerencias" };
  }
  const allowedPts = new Set(
    (myManagements ?? [])
      .filter((m) => m.branch_id === parsed.data.branch_id)
      .map((m) => m.product_type_id),
  );
  for (const pt of parsed.data.product_type_ids) {
    if (!allowedPts.has(pt)) {
      return {
        ok: false,
        message: "Algún tipo de producto no está en tu gerencia",
      };
    }
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 1) Crear el user vía generateLink (sin enviar email todavía).
  const link = await generateInvitationLink(supabase, {
    email: parsed.data.email,
    metadata: {
      role: "sales",
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

  // 2) Setear branch_id + manager_id + comisión en el profile.
  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      branch_id: parsed.data.branch_id,
      manager_id: profile.id,
      commission_percent: parsed.data.commission_percent,
      commission_conditions: parsed.data.commission_conditions || null,
    })
    .eq("id", newUserId);
  if (pErr) {
    await supabase.auth.admin.deleteUser(newUserId);
    return { ok: false, message: pErr.message };
  }

  // 3) Asignar tipos de producto al vendedor.
  const uptRows = parsed.data.product_type_ids.map((pt) => ({
    user_id: newUserId,
    product_type_id: pt,
  }));
  const { error: uptErr } = await supabase
    .from("user_product_types")
    .insert(uptRows);
  if (uptErr) {
    await supabase.auth.admin.deleteUser(newUserId);
    return { ok: false, message: uptErr.message };
  }

  // 4) Enviar email vía Resend al final. Si falla, rollback completo.
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
    role: "sales",
    actionLink: link.actionLink,
  });

  if (!emailResult.ok) {
    await supabase
      .from("user_product_types")
      .delete()
      .eq("user_id", newUserId);
    await supabase.auth.admin.deleteUser(newUserId);
    return {
      ok: false,
      message: `No se pudo enviar el email: ${emailResult.message}`,
    };
  }

  revalidatePath("/manager/team");
  return { ok: true, userId: newUserId };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  commission_percent: z.coerce.number().min(0).max(100),
  commission_conditions: z.string().optional().or(z.literal("")),
  product_type_ids: z.array(z.string().uuid()).min(1),
});

export type UpdateSellerInput = z.input<typeof updateSchema>;

export async function updateSeller(
  raw: UpdateSellerInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["manager"]);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  const supabase = createAdminClient();

  // Verificar que el seller es de este manager.
  const { data: seller } = await supabase
    .from("profiles")
    .select("manager_id")
    .eq("id", parsed.data.id)
    .single();
  if (!seller || seller.manager_id !== profile.id) {
    return { ok: false, message: "No podés editar este vendedor" };
  }

  await supabase
    .from("profiles")
    .update({
      commission_percent: parsed.data.commission_percent,
      commission_conditions: parsed.data.commission_conditions || null,
    })
    .eq("id", parsed.data.id);

  // Sync user_product_types
  await supabase
    .from("user_product_types")
    .delete()
    .eq("user_id", parsed.data.id);
  if (parsed.data.product_type_ids.length > 0) {
    await supabase.from("user_product_types").insert(
      parsed.data.product_type_ids.map((pt) => ({
        user_id: parsed.data.id,
        product_type_id: pt,
      })),
    );
  }

  revalidatePath("/manager/team");
  return { ok: true };
}

export async function toggleSellerStatus(
  userId: string,
  next: "active" | "inactive",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["manager"]);
  const supabase = createAdminClient();

  const { data: seller } = await supabase
    .from("profiles")
    .select("manager_id")
    .eq("id", userId)
    .single();
  if (!seller || seller.manager_id !== profile.id) {
    return { ok: false, message: "No podés editar este vendedor" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status: next })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/manager/team");
  return { ok: true };
}

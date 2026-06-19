"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  label: z.string().min(1, "Poné un nombre").max(80),
  body: z.string().min(1, "El mensaje no puede estar vacío").max(2000),
});

export type GlobalTemplateInput = z.input<typeof schema>;
type Result = { ok: true; id?: string } | { ok: false; message: string };

export async function createGlobalTemplate(
  input: GlobalTemplateInput,
): Promise<Result> {
  await requireRole(["super_admin"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      scope: "global",
      label: parsed.data.label.trim(),
      body: parsed.data.body.trim(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }
  revalidatePath("/super-admin/templates");
  return { ok: true, id: data.id };
}

export async function updateGlobalTemplate(
  id: string,
  input: GlobalTemplateInput,
): Promise<Result> {
  await requireRole(["super_admin"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("message_templates")
    .update({ label: parsed.data.label.trim(), body: parsed.data.body.trim() })
    .eq("id", id)
    .eq("scope", "global");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/templates");
  return { ok: true, id };
}

export async function deleteGlobalTemplate(id: string): Promise<Result> {
  await requireRole(["super_admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("scope", "global");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/templates");
  return { ok: true, id };
}

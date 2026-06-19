"use server";

import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  label: z.string().min(1, "Poné un nombre").max(80),
  body: z.string().min(1, "El mensaje no puede estar vacío").max(2000),
});

export type TemplateInput = z.input<typeof schema>;
type Result = { ok: true; id?: string } | { ok: false; message: string };

// ----------------------------------------------------------------------------
// Plantillas propias (vendedor / gerente / admin). La RLS limita a las suyas.
// ----------------------------------------------------------------------------

export async function createMyTemplate(input: TemplateInput): Promise<Result> {
  const profile = await requireRole(["sales", "manager", "admin"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      scope: "user",
      owner_id: profile.id,
      company_id: profile.company_id,
      label: parsed.data.label.trim(),
      body: parsed.data.body.trim(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }
  return { ok: true, id: data.id };
}

export async function updateMyTemplate(
  id: string,
  input: TemplateInput,
): Promise<Result> {
  await requireRole(["sales", "manager", "admin"]);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Inválido" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("message_templates")
    .update({ label: parsed.data.label.trim(), body: parsed.data.body.trim() })
    .eq("id", id)
    .eq("scope", "user");
  if (error) return { ok: false, message: error.message };
  return { ok: true, id };
}

export async function deleteMyTemplate(id: string): Promise<Result> {
  await requireRole(["sales", "manager", "admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("scope", "user");
  if (error) return { ok: false, message: error.message };
  return { ok: true, id };
}

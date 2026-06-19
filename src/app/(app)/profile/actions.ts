"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio"),
  last_name: z.string().min(1, "Apellido obligatorio"),
  phone: z.string().optional().or(z.literal("")),
});

export async function updateMyProfile(
  input: z.input<typeof schema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireProfile();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.first_name.trim(),
      last_name: parsed.data.last_name.trim(),
      phone: parsed.data.phone?.trim() || null,
    })
    .eq("id", profile.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

export async function updateMyAvatar(
  url: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", profile.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export async function changeMyPassword(
  input: z.input<typeof passwordSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireProfile();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirm: z.string(),
    terms: z.literal("on", {
      message: "Tenés que aceptar los Términos y Condiciones",
    }),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export type AcceptInvitationState = {
  fieldErrors?: Record<string, string>;
  formError?: string;
};

export async function acceptInvitation(
  _prev: AcceptInvitationState | undefined,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    terms: formData.get("terms"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: updateUserErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateUserErr) {
    return { formError: updateUserErr.message };
  }

  const { error: updateProfileErr } = await supabase
    .from("profiles")
    .update({
      status: "active",
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateProfileErr) {
    return { formError: updateProfileErr.message };
  }

  redirect("/?toast=Cuenta%20activada.%20Bienvenido.&type=success");
}

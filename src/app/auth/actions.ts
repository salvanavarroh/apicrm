"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type SignInState = {
  error?: string;
};

export async function signIn(
  _prev: SignInState | undefined,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Email o contraseña incorrectos" };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();

  // Antes de cerrar sesión hay que salir del reparto del inbox. Si no, el
  // vendedor queda `inbox_available = true` y el round-robin le sigue asignando
  // conversaciones hasta que expira la ventana de frescura (15 min), o sea que
  // le entran mensajes que nadie va a leer.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({ inbox_available: false, inbox_available_at: null })
      .eq("id", user.id);
  }

  await supabase.auth.signOut();
  redirect("/login");
}

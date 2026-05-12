import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Nueva contraseña · API",
};

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col gap-6 px-8 py-8">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <header className="text-center">
            <h1 className="text-2xl font-bold">Elegí una nueva contraseña</h1>
            <p className="text-sm text-muted-foreground">
              Para tu seguridad, mínimo 8 caracteres.
            </p>
          </header>
          <ResetForm />
        </CardContent>
      </Card>
    </main>
  );
}

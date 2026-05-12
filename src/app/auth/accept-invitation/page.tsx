import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";

import { AcceptForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Activar cuenta · API",
};

export default async function AcceptInvitationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");
  if (profile.status === "active") redirect("/");

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const greeting = fullName || user.email || "";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col gap-6 px-8 py-8">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <header className="text-center">
            <h1 className="text-2xl font-bold leading-tight">
              Bienvenido{greeting ? `, ${greeting}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground">
              Para activar tu cuenta, elegí una contraseña y aceptá los Términos.
            </p>
          </header>
          <AcceptForm />
        </CardContent>
      </Card>
    </main>
  );
}

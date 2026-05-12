import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const greeting =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    "";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bienvenido{greeting ? `, ${greeting}` : ""}</CardTitle>
          <CardDescription>
            Para activar tu cuenta, elegí una contraseña y aceptá los Términos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptForm />
        </CardContent>
      </Card>
    </main>
  );
}

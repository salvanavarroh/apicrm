import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · API",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col gap-6 px-8 py-8">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <ForgotForm />
        </CardContent>
      </Card>
    </main>
  );
}

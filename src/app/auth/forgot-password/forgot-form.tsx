"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(requestPasswordReset, {});

  if (state.sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-blue-100 p-3 text-blue-600">✉️</div>
        <h2 className="text-xl font-bold leading-tight">
          Enviamos un link de recuperación a tu mail
        </h2>
        <p className="text-sm text-muted-foreground">
          Enviamos el link de recuperación de mail a:{" "}
          <strong>{state.sentTo}</strong>
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/login">Volver al login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@empresa.com"
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Enviando…" : "Enviar link de recuperación"}
      </Button>

      <p className="text-center">
        <Link
          href="/login"
          className="text-sm text-blue-600 underline-offset-2 hover:underline"
        >
          Volver al login
        </Link>
      </p>
    </form>
  );
}

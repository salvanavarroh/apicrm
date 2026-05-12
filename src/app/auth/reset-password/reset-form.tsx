"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resetPassword, type ResetPasswordState } from "./actions";

function FieldError({
  errors,
  field,
}: {
  errors: Record<string, string> | undefined;
  field: string;
}) {
  if (!errors?.[field]) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {errors[field]}
    </p>
  );
}

export function ResetForm() {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPassword, {});

  const fe = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <FieldError errors={fe} field="password" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Repetir contraseña</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <FieldError errors={fe} field="confirm" />
      </div>

      {state.formError && (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

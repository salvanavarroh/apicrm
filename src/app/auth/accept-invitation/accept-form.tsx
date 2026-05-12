"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  acceptInvitation,
  type AcceptInvitationState,
} from "./actions";

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

export function AcceptForm() {
  const [state, formAction, pending] = useActionState<
    AcceptInvitationState,
    FormData
  >(acceptInvitation, {});

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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-1 h-4 w-4 rounded border-input"
        />
        <span>
          Acepto los{" "}
          <a
            href="/terms"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Términos y Condiciones
          </a>{" "}
          y la{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Política de Privacidad
          </a>
          .
        </span>
      </label>
      <FieldError errors={fe} field="terms" />

      {state.formError && (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Activando…" : "Activar cuenta"}
      </Button>
    </form>
  );
}

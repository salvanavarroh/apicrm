"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  updateOperationalCompany,
  type UpdateCompanyState,
} from "./actions";

export function CompanyForm({
  initial,
}: {
  initial: {
    name: string;
    phone: string | null;
    address: string | null;
    logo_url: string | null;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    UpdateCompanyState,
    FormData
  >(updateOperationalCompany, {});

  useEffect(() => {
    if (state.success) {
      toast.success("Datos actualizados");
      router.refresh();
    }
  }, [state.success, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Nombre comercial</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initial.name}
          required
        />
        {fe.name && <p className="text-xs text-destructive">{fe.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" defaultValue={initial.phone ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          name="address"
          defaultValue={initial.address ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="logo_url">URL del logo</Label>
        <Input
          id="logo_url"
          name="logo_url"
          type="url"
          placeholder="https://…"
          defaultValue={initial.logo_url ?? ""}
        />
        {fe.logo_url && (
          <p className="text-xs text-destructive">{fe.logo_url}</p>
        )}
      </div>

      {state.formError && (
        <p className="sm:col-span-2 text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createCompanyWithAdmin,
  type CreateCompanyState,
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

export function NewCompanyForm() {
  const [state, formAction, pending] = useActionState<
    CreateCompanyState,
    FormData
  >(createCompanyWithAdmin, {});

  const fe = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold">1. Datos de la empresa</h2>
          <p className="text-sm text-muted-foreground">
            Los datos legales solo los puede editar el SuperAdmin (vos).
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="company.name">Nombre comercial *</Label>
            <Input
              id="company.name"
              name="company.name"
              required
              placeholder="Salvador Concesionarios"
            />
            <FieldError errors={fe} field="company.name" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.legal_name">Razón social</Label>
            <Input id="company.legal_name" name="company.legal_name" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.cuit">CUIT</Label>
            <Input
              id="company.cuit"
              name="company.cuit"
              placeholder="30-12345678-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.phone">Teléfono</Label>
            <Input id="company.phone" name="company.phone" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.address">Dirección</Label>
            <Input id="company.address" name="company.address" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.monthly_price">Precio mensual (ARS)</Label>
            <Input
              id="company.monthly_price"
              name="company.monthly_price"
              type="number"
              min={0}
              step="0.01"
              placeholder="50000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company.subscription_ends_at">
              Vencimiento de suscripción
            </Label>
            <Input
              id="company.subscription_ends_at"
              name="company.subscription_ends_at"
              type="date"
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <header>
          <h2 className="text-lg font-semibold">2. Admin inicial</h2>
          <p className="text-sm text-muted-foreground">
            Le mandamos un email para que setee su contraseña y entre.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="admin.email">Email del Admin *</Label>
            <Input
              id="admin.email"
              name="admin.email"
              type="email"
              required
              placeholder="admin@empresa.com"
            />
            <FieldError errors={fe} field="admin.email" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin.first_name">Nombre *</Label>
            <Input id="admin.first_name" name="admin.first_name" required />
            <FieldError errors={fe} field="admin.first_name" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin.last_name">Apellido *</Label>
            <Input id="admin.last_name" name="admin.last_name" required />
            <FieldError errors={fe} field="admin.last_name" />
          </div>
        </div>
      </section>

      {state.formError && (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button asChild variant="ghost">
          <Link href="/super-admin">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear empresa e invitar Admin"}
        </Button>
      </div>
    </form>
  );
}

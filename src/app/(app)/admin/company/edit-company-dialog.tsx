"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveCompanyOperational } from "./actions";

const schema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  address: z.string().optional(),
  phone: z.string().optional(),
  logo_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

type Initial = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
};

export function EditCompanyDialog({
  trigger,
  initial,
}: {
  trigger: ReactNode;
  initial: Initial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(initial.name);
      setAddress(initial.address ?? "");
      setPhone(initial.phone ?? "");
      setLogoUrl(initial.logo_url ?? "");
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    const parsed = schema.safeParse({ name, address, phone, logo_url: logoUrl });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    startTransition(async () => {
      const result = await saveCompanyOperational(parsed.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Datos de la empresa actualizados");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar concesionaria</DialogTitle>
          <DialogDescription>
            Puedes modificar cada detalle de tu empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-name">Nombre</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-address">Dirección</Label>
            <Input
              id="ec-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección de la concesionaria"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-phone">Número de teléfono</Label>
            <Input
              id="ec-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-logo">URL del logo</Label>
            <Input
              id="ec-logo"
              type="url"
              placeholder="https://…"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex-1"
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

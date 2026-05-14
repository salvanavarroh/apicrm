"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

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

import { createBranchAsSuperAdmin } from "./actions";

export function CreateBranchDialog({
  trigger,
  companyId,
}: {
  trigger: ReactNode;
  companyId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setAddress("");
      setCity("");
      setPhone("");
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await createBranchAsSuperAdmin({
        company_id: companyId,
        name,
        address,
        city,
        phone,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Sucursal "${name}" creada`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar nueva sucursal</DialogTitle>
          <DialogDescription>
            La sucursal queda activa de inmediato en la concesionaria.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cb-name">Nombre</Label>
            <Input
              id="cb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sucursal Centro"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cb-address">Dirección</Label>
            <Input
              id="cb-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cb-city">Ciudad</Label>
            <Input
              id="cb-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cb-phone">Número de teléfono</Label>
            <Input
              id="cb-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              {pending ? "Creando…" : "Crear sucursal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

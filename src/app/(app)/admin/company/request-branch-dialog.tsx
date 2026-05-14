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

import { requestBranch } from "./branch-request-actions";

export function RequestBranchDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setAddress("");
      setCity("");
      setPhone("");
      setNotes("");
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await requestBranch({
        name,
        address,
        city,
        phone,
        notes,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Solicitud enviada al SuperAdmin");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar nueva sucursal</DialogTitle>
          <DialogDescription>
            El SuperAdmin recibirá tu solicitud y, al aprobarla, la sucursal
            quedará disponible en tu empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-name">Nombre</Label>
            <Input
              id="rb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sucursal Centro"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-address">Dirección</Label>
            <Input
              id="rb-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-city">Ciudad</Label>
            <Input
              id="rb-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-phone">Número de teléfono</Label>
            <Input
              id="rb-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rb-notes">Notas (opcional)</Label>
            <Input
              id="rb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información adicional para el SuperAdmin"
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
              {pending ? "Enviando…" : "Solicitar sucursal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

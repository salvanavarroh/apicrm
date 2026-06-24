"use client";

import { Plus, Trash2 } from "lucide-react";
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

import { requestBranches } from "./branch-request-actions";

type BranchEntry = {
  name: string;
  address: string;
  city: string;
  phone: string;
  notes: string;
};

const emptyEntry = (): BranchEntry => ({
  name: "",
  address: "",
  city: "",
  phone: "",
  notes: "",
});

export function RequestBranchDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<BranchEntry[]>([emptyEntry()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setEntries([emptyEntry()]);
      setError(null);
    }
    setOpen(next);
  }

  function update(i: number, patch: Partial<BranchEntry>) {
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );
  }

  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    const cleaned = entries.filter((e) => e.name.trim().length > 0);
    if (cleaned.length === 0) {
      setError("Cargá el nombre de al menos una sucursal");
      return;
    }
    startTransition(async () => {
      const result = await requestBranches(cleaned);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(
        result.count === 1
          ? "Solicitud enviada al SuperAdmin"
          : `${result.count} solicitudes enviadas al SuperAdmin`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar sucursales</DialogTitle>
          <DialogDescription>
            Podés solicitar varias sucursales de una. El SuperAdmin recibirá las
            solicitudes y, al aprobarlas, quedarán disponibles en tu empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-md border border-border p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Sucursal {i + 1}
                </span>
                {entries.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar sucursal"
                    className="size-7 text-destructive"
                    onClick={() => removeEntry(i)}
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-name-${i}`}>Nombre</Label>
                <Input
                  id={`rb-name-${i}`}
                  value={entry.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Sucursal Centro"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-address-${i}`}>Dirección</Label>
                <Input
                  id={`rb-address-${i}`}
                  value={entry.address}
                  onChange={(e) => update(i, { address: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-city-${i}`}>Ciudad</Label>
                <Input
                  id={`rb-city-${i}`}
                  value={entry.city}
                  onChange={(e) => update(i, { city: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-phone-${i}`}>Número de teléfono</Label>
                <Input
                  id={`rb-phone-${i}`}
                  value={entry.phone}
                  onChange={(e) => update(i, { phone: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rb-notes-${i}`}>Notas (opcional)</Label>
                <Input
                  id={`rb-notes-${i}`}
                  value={entry.notes}
                  onChange={(e) => update(i, { notes: e.target.value })}
                  placeholder="Información adicional para el SuperAdmin"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEntry}
            disabled={pending}
            className="self-start"
          >
            <Plus className="mr-1 size-4" /> Agregar otra sucursal
          </Button>

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
              {pending
                ? "Enviando…"
                : entries.length > 1
                  ? `Solicitar ${entries.length} sucursales`
                  : "Solicitar sucursal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

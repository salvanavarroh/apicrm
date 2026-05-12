"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { upsertProductType } from "./actions";

type Branch = { id: string; name: string };
type ProductType = {
  id: string;
  name: string;
  status: "active" | "inactive";
  branch_ids: string[];
};

export function ProductTypeDialog({
  trigger,
  branches,
  productType,
}: {
  trigger: ReactNode;
  branches: Branch[];
  productType?: ProductType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(productType?.name ?? "");
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    productType?.branch_ids ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(productType?.name ?? "");
      setSelectedBranches(productType?.branch_ids ?? []);
      setError(null);
    }
    setOpen(next);
  }

  function toggleBranch(id: string) {
    setSelectedBranches((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertProductType({
        id: productType?.id,
        name,
        branch_ids: selectedBranches,
        status: productType?.status ?? "active",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(
        productType ? "Tipo de producto actualizado" : "Tipo de producto creado",
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {productType ? "Editar tipo de producto" : "Nuevo tipo de producto"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pt-name">Nombre</Label>
            <Input
              id="pt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: 0km, Usados, Plan de ahorro"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Habilitado en sucursales</Label>
            {branches.length === 0 ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                No tenés sucursales todavía. Creá una primero.
              </p>
            ) : (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      className="size-4 rounded border-input"
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
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
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { LeadFormOption } from "@/components/leads/lead-form";

import { createPrice, updatePrice, type PriceInput } from "./actions";

type Initial = PriceInput & { id?: string };

type Props = {
  trigger: ReactNode;
  initial?: Initial;
  productTypes: LeadFormOption[];
};

const EMPTY: PriceInput = {
  brand: "",
  model: "",
  version: "",
  model_year: "",
  currency: "ARS",
  list_price: "" as unknown as number,
  notes: "",
  status: "active",
  product_type_id: "",
};

export function PriceDialog({ trigger, initial, productTypes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PriceInput>({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial?.id;

  function update<K extends keyof PriceInput>(key: K, value: PriceInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      const result = isEdit
        ? await updatePrice(initial!.id!, data)
        : await createPrice(data);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(isEdit ? "Precio actualizado" : "Precio agregado");
      setOpen(false);
      if (!isEdit) setData({ ...EMPTY });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setData({ ...EMPTY, ...initial });
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar precio" : "Nuevo precio"}
          </DialogTitle>
          <DialogDescription>
            Datos referenciales. El Vendedor define el precio final al cotizar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marca</Label>
              <Input
                value={data.brand}
                onChange={(e) => update("brand", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Modelo</Label>
              <Input
                value={data.model}
                onChange={(e) => update("model", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Versión</Label>
              <Input
                value={data.version ?? ""}
                onChange={(e) => update("version", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Año</Label>
              <Input
                value={data.model_year ?? ""}
                onChange={(e) => update("model_year", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr_120px] gap-3">
            <div>
              <Label className="text-xs">Tipo producto</Label>
              <Select
                value={data.product_type_id ?? ""}
                onValueChange={(v) => update("product_type_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Precio</Label>
              <MoneyInput
                value={data.list_price as string | number}
                onValueChange={(v) =>
                  update(
                    "list_price",
                    v as unknown as PriceInput["list_price"],
                  )
                }
              />
            </div>
            <div>
              <Label className="text-xs">Moneda</Label>
              <Input
                value={data.currency}
                onChange={(e) =>
                  update("currency", e.target.value.toUpperCase())
                }
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={2}
              value={data.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Estado</Label>
            <Select
              value={data.status}
              onValueChange={(v) =>
                update("status", v as PriceInput["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

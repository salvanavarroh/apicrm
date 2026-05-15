"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { LeadFormOption } from "@/components/leads/lead-form";

import { classifyLead } from "@/app/(app)/admin/leads/actions";

type Props = {
  leadId: string;
  currentBranchId: string | null;
  currentProductTypeId: string | null;
  branches: LeadFormOption[];
  productTypes: LeadFormOption[];
};

export function ProviderPoolRow({
  leadId,
  currentBranchId,
  currentProductTypeId,
  branches,
  productTypes,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [productTypeId, setProductTypeId] = useState(
    currentProductTypeId ?? "",
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!branchId || !productTypeId) {
      toast.error("Sucursal y tipo son obligatorios");
      return;
    }
    startTransition(async () => {
      const result = await classifyLead(leadId, branchId, productTypeId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Lead clasificado");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Button asChild size="sm" variant="ghost">
        <Link href={`/data-provider/leads/${leadId}`}>Editar</Link>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Clasificar
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clasificar lead</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Sucursal</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí una sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Tipo de producto</Label>
              <Select value={productTypeId} onValueChange={setProductTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un tipo" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Clasificar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { inviteSeller } from "./actions";

type Branch = {
  id: string;
  name: string;
  productTypes: { id: string; name: string }[];
};

export function InviteSellerDialog({
  trigger,
  branches,
}: {
  trigger: ReactNode;
  branches: Branch[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState<string>(branches[0]?.id ?? "");
  const [productTypeIds, setProductTypeIds] = useState<string[]>([]);
  const [commission, setCommission] = useState("");
  const [conditions, setConditions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setFirst("");
      setLast("");
      setEmail("");
      setPhone("");
      setBranchId(branches[0]?.id ?? "");
      setProductTypeIds([]);
      setCommission("");
      setConditions("");
      setError(null);
    }
    setOpen(next);
  }

  function togglePt(id: string) {
    setProductTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await inviteSeller({
        first_name: first,
        last_name: last,
        email,
        phone,
        branch_id: branchId,
        product_type_ids: productTypeIds,
        commission_percent: commission as unknown as number,
        commission_conditions: conditions,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Invitación enviada a ${email}`);
      setOpen(false);
      router.refresh();
    });
  }

  const selectedBranch = branches.find((b) => b.id === branchId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar vendedor</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-first">Nombre</Label>
              <Input
                id="sl-first"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-last">Apellido</Label>
              <Input
                id="sl-last"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-email">Email</Label>
            <Input
              id="sl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-phone">Teléfono (opcional)</Label>
            <Input
              id="sl-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Sucursal</Label>
            {branches.length === 0 ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Aún no tenés gerencias asignadas. Pedile al Admin.
              </p>
            ) : (
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Tipos de producto (subset de tu gerencia)</Label>
            {selectedBranch?.productTypes.length ? (
              <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                {selectedBranch.productTypes.map((pt) => (
                  <label
                    key={pt.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={productTypeIds.includes(pt.id)}
                      onChange={() => togglePt(pt.id)}
                      className="size-4 rounded border-input"
                    />
                    {pt.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Sin tipos en esta sucursal.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sl-comm">Comisión (%)</Label>
              <Input
                id="sl-comm"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sl-conds">Condiciones (opcional)</Label>
            <Input
              id="sl-conds"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="Ej: bonus por superar 5 ventas"
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
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Invitando…" : "Enviar invitación"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

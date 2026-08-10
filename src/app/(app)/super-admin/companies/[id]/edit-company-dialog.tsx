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
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PlanSelect } from "@/components/companies/plan-select";
import type { CompanyPlan } from "@/lib/plans";

import { updateCompanyAsSuperAdmin } from "./actions";

type Initial = {
  id: string;
  name: string;
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  plan: CompanyPlan | null;
  monthly_price: number | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  status: "pending" | "active" | "suspended";
};

function plusDaysIso(base: string, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function EditCompanyAsSuperAdminDialog({
  trigger,
  initial,
}: {
  trigger: ReactNode;
  initial: Initial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [legalName, setLegalName] = useState(initial.legal_name ?? "");
  const [cuit, setCuit] = useState(initial.cuit ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [plan, setPlan] = useState<CompanyPlan | null>(initial.plan);
  const [monthlyPrice, setMonthlyPrice] = useState(
    initial.monthly_price !== null ? String(initial.monthly_price) : "",
  );
  const [startsAt, setStartsAt] = useState(initial.subscription_starts_at ?? "");
  const [endsAt, setEndsAt] = useState(initial.subscription_ends_at ?? "");
  const [status, setStatus] = useState<"pending" | "active" | "suspended">(
    initial.status,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(initial.name);
      setLegalName(initial.legal_name ?? "");
      setCuit(initial.cuit ?? "");
      setPhone(initial.phone ?? "");
      setAddress(initial.address ?? "");
      setPlan(initial.plan);
      setMonthlyPrice(
        initial.monthly_price !== null ? String(initial.monthly_price) : "",
      );
      setStartsAt(initial.subscription_starts_at ?? "");
      setEndsAt(initial.subscription_ends_at ?? "");
      setStatus(initial.status);
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await updateCompanyAsSuperAdmin({
        id: initial.id,
        name,
        legal_name: legalName,
        cuit,
        phone,
        address,
        plan,
        monthly_price: monthlyPrice,
        subscription_starts_at: startsAt,
        subscription_ends_at: endsAt,
        status,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Concesionaria actualizada");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar concesionaria</DialogTitle>
          <DialogDescription>
            Podés modificar todos los detalles, incluyendo datos legales y
            facturación.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-name">Nombre comercial</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-legal">Razón social</Label>
              <Input
                id="ec-legal"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-cuit">CUIT</Label>
              <Input
                id="ec-cuit"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="30-12345678-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-phone">Teléfono</Label>
              <Input
                id="ec-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-address">Dirección</Label>
              <Input
                id="ec-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Plan</Label>
            <PlanSelect value={plan} onChange={setPlan} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-price">Precio mensual a cobrar</Label>
            <MoneyInput
              id="ec-price"
              placeholder="0"
              value={monthlyPrice}
              onValueChange={setMonthlyPrice}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-start">Fecha de alta</Label>
              <Input
                id="ec-start"
                type="date"
                value={startsAt}
                onChange={(e) => {
                  const start = e.target.value;
                  setStartsAt(start);
                  if (start) setEndsAt(plusDaysIso(start, 30));
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ec-end">Fecha de vencimiento</Label>
              <Input
                id="ec-end"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Estado</Label>
            <Select
              value={status}
              onValueChange={(v) =>
                setStatus(v as "pending" | "active" | "suspended")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="suspended">Suspendida</SelectItem>
              </SelectContent>
            </Select>
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

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { LEAD_PAYMENT_OPTIONS, fullName, type LeadInput } from "@/lib/leads";

import {
  createLead,
  type DuplicateInfo,
  updateLead,
} from "@/app/(app)/admin/leads/actions";

export type LeadFormMode = "create" | "edit";

export type LeadFormOption = { id: string; label: string };

type Props = {
  mode: LeadFormMode;
  initial?: Partial<LeadInput> & { id?: string };
  branches: LeadFormOption[];
  productTypes: LeadFormOption[];
  campaigns: LeadFormOption[];
  redirectTo: string;
  // Bloquea/auto-completa branch+product_type+campaign (ej: Provider no elige).
  lockClassification?: boolean;
};

const EMPTY: LeadInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  city: "",
  vehicle_model: "",
  vehicle_version: "",
  preferred_color: "",
  budget_min: "",
  budget_max: "",
  has_used_car: false,
  used_car_description: "",
  declared_payment_method: "",
  campaign_id: "",
  branch_id: "",
  product_type_id: "",
  initial_notes: "",
};

export function LeadForm({
  mode,
  initial,
  branches,
  productTypes,
  campaigns,
  redirectTo,
  lockClassification,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<LeadInput>({ ...EMPTY, ...initial });
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function submit(modeArg: "auto" | "skip_check" | "register_submission") {
    setError(null);
    startTransition(async () => {
      const action =
        mode === "edit" && initial?.id
          ? () => updateLead(initial.id!, data)
          : () => createLead(data, { mode: modeArg });
      const result = await action();
      if (!result.ok) {
        if ("duplicate" in result && result.duplicate) {
          setDuplicate(result.duplicate);
          return;
        }
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(mode === "edit" ? "Lead actualizado" : "Lead creado");
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cliente */}
      <Section title="Datos del cliente">
        <Grid2>
          <Field label="Nombre">
            <Input
              value={data.first_name ?? ""}
              onChange={(e) => update("first_name", e.target.value)}
            />
          </Field>
          <Field label="Apellido">
            <Input
              value={data.last_name ?? ""}
              onChange={(e) => update("last_name", e.target.value)}
            />
          </Field>
          <Field label="Teléfono" hint="Obligatorio (o email)">
            <Input
              value={data.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+54 11 1234 5678"
            />
          </Field>
          <Field label="Email" hint="Obligatorio (o teléfono)">
            <Input
              type="email"
              value={data.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="cliente@dominio.com"
            />
          </Field>
          <Field label="Ciudad">
            <Input
              value={data.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
            />
          </Field>
        </Grid2>
      </Section>

      {/* Vehículo */}
      <Section title="Vehículo de interés">
        <Grid2>
          <Field label="Modelo">
            <Input
              value={data.vehicle_model ?? ""}
              onChange={(e) => update("vehicle_model", e.target.value)}
            />
          </Field>
          <Field label="Versión">
            <Input
              value={data.vehicle_version ?? ""}
              onChange={(e) => update("vehicle_version", e.target.value)}
            />
          </Field>
          <Field label="Color preferido">
            <Input
              value={data.preferred_color ?? ""}
              onChange={(e) => update("preferred_color", e.target.value)}
            />
          </Field>
          <Field label="Forma de pago declarada">
            <Select
              value={(data.declared_payment_method as string) || ""}
              onValueChange={(v) =>
                update("declared_payment_method", (v || "") as LeadInput["declared_payment_method"])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_PAYMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Presupuesto mínimo">
            <MoneyInput
              value={data.budget_min as string | number}
              onValueChange={(v) =>
                update("budget_min", v as LeadInput["budget_min"])
              }
            />
          </Field>
          <Field label="Presupuesto máximo">
            <MoneyInput
              value={data.budget_max as string | number}
              onValueChange={(v) =>
                update("budget_max", v as LeadInput["budget_max"])
              }
            />
          </Field>
        </Grid2>

        <label className="flex items-center gap-2 pt-2">
          <Checkbox
            checked={data.has_used_car ?? false}
            onCheckedChange={(v) => update("has_used_car", Boolean(v))}
          />
          <span className="text-sm">Tiene auto usado para entregar</span>
        </label>

        {data.has_used_car && (
          <Field label="Descripción del usado">
            <Textarea
              value={data.used_car_description ?? ""}
              onChange={(e) =>
                update("used_car_description", e.target.value)
              }
              rows={2}
              placeholder="Marca, modelo, año, kilometraje"
            />
          </Field>
        )}
      </Section>

      {/* Routing */}
      {!lockClassification && (
        <Section title="Asignación comercial">
          <Grid2>
            <Field label="Sucursal">
              <Select
                value={data.branch_id ?? ""}
                onValueChange={(v) => update("branch_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de producto">
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
            </Field>
            <Field label="Campaña">
              <Select
                value={data.campaign_id ?? ""}
                onValueChange={(v) => update("campaign_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Grid2>
        </Section>
      )}

      <Section title="Notas iniciales">
        <Textarea
          value={data.initial_notes ?? ""}
          onChange={(e) => update("initial_notes", e.target.value)}
          rows={3}
          placeholder="Información adicional para el vendedor"
        />
      </Section>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(redirectTo)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => submit("auto")}
          disabled={pending}
        >
          {pending ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear lead"}
        </Button>
      </div>

      <Dialog open={!!duplicate} onOpenChange={(o) => !o && setDuplicate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Posible duplicado</DialogTitle>
            <DialogDescription>
              Encontramos un lead con el mismo teléfono o email cargado en tu
              empresa.
            </DialogDescription>
          </DialogHeader>
          {duplicate && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <p className="font-medium">
                {fullName(duplicate.first_name, duplicate.last_name)}
              </p>
              <p className="text-xs text-muted-foreground">
                {duplicate.phone ?? "—"} · {duplicate.email ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Estado actual: {duplicate.status}
              </p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setDuplicate(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("register_submission")}
              disabled={pending}
            >
              Registrar como nueva carga
            </Button>
            <Button
              onClick={() => submit("skip_check")}
              disabled={pending}
            >
              Crear igual (lead nuevo)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

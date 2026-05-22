"use client";

import { Eye, FileCheck2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatARS } from "@/lib/format";

import {
  createQuote,
  previewQuote,
  type QuoteInput,
} from "@/app/(app)/sales/leads/[id]/quote/actions";

type Modality = "cash" | "financed" | "savings_plan";

type PriceOption = { id: string; label: string; price: number };

type Initial = Partial<QuoteInput>;

type FormState = {
  modality: Modality;
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  client_phone: string;
  client_dni: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_version: string;
  vehicle_year: string;
  vehicle_color: string;
  base_price: string;
  discount: string;
  used_car_value: string;
  valid_until: string;
  notes: string;
  // Modality-specific
  down_payment: string;
  financed_amount: string;
  installments: string;
  tna: string;
  cft: string;
  installment_value: string;
  plan_name: string;
  total_installments: string;
  initial_installment: string;
  current_installment_value: string;
  administrative_fees: string;
};

const EMPTY: FormState = {
  modality: "cash",
  client_first_name: "",
  client_last_name: "",
  client_email: "",
  client_phone: "",
  client_dni: "",
  vehicle_brand: "",
  vehicle_model: "",
  vehicle_version: "",
  vehicle_year: "",
  vehicle_color: "",
  base_price: "",
  discount: "0",
  used_car_value: "0",
  valid_until: defaultValid(),
  notes: "",
  down_payment: "",
  financed_amount: "",
  installments: "",
  tna: "",
  cft: "",
  installment_value: "",
  plan_name: "",
  total_installments: "",
  initial_installment: "",
  current_installment_value: "",
  administrative_fees: "",
};

function defaultValid() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function QuoteBuilder({
  leadId,
  initial,
  prices,
}: {
  leadId: string;
  initial: Initial;
  prices: PriceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [data, setData] = useState<FormState>({
    ...EMPTY,
    ...(initial as Partial<FormState>),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const totals = useMemo(() => {
    const base = Number(data.base_price) || 0;
    const disc = Number(data.discount) || 0;
    const used = Number(data.used_car_value) || 0;
    return {
      base,
      disc,
      used,
      total: Math.max(0, base - disc - used),
    };
  }, [data.base_price, data.discount, data.used_car_value]);

  // Auto-calc para Detalle financiado.
  // - Si hay anticipo y no se cargó monto a financiar manualmente, sugerimos
  //   total − anticipo.
  // - Si hay monto a financiar + cuotas + TNA, calculamos valor de cuota por
  //   amortización francesa.
  const finance = useMemo(() => {
    const downPayment = Number(data.down_payment) || 0;
    const financedAmount =
      Number(data.financed_amount) ||
      Math.max(0, totals.total - downPayment);
    const installments = Number(data.installments) || 0;
    const tnaPct = Number((data.tna || "").replace(",", ".")) || 0;
    const cftPct = Number((data.cft || "").replace(",", ".")) || 0;

    let monthlyPayment = Number(data.installment_value) || 0;
    if (installments > 0 && financedAmount > 0) {
      if (tnaPct > 0) {
        // Amortización francesa: PMT = P * r * (1+r)^n / ((1+r)^n - 1)
        const r = tnaPct / 100 / 12;
        const f = Math.pow(1 + r, installments);
        monthlyPayment = (financedAmount * r * f) / (f - 1);
      } else if (!data.installment_value) {
        // Sin TNA: cuota plana = monto / cuotas.
        monthlyPayment = financedAmount / installments;
      }
    }

    const totalToPay = monthlyPayment * installments + downPayment;
    const totalInterest = Math.max(
      0,
      monthlyPayment * installments - financedAmount,
    );

    return {
      downPayment,
      financedAmount,
      installments,
      tnaPct,
      cftPct,
      monthlyPayment,
      totalToPay,
      totalInterest,
    };
  }, [
    data.down_payment,
    data.financed_amount,
    data.installments,
    data.tna,
    data.cft,
    data.installment_value,
    totals.total,
  ]);

  // Auto-rellenado: cuando cambia anticipo (y financed_amount está vacío) →
  // financed_amount = total − anticipo. Cuando cambia financed_amount / cuotas
  // / tna → installment_value se setea con el valor calculado, salvo que el
  // user lo haya escrito.
  function handleDownPayment(v: string) {
    setData((d) => {
      const next = { ...d, down_payment: v };
      const dp = Number(v) || 0;
      if (totals.total > 0) {
        next.financed_amount = String(Math.max(0, totals.total - dp));
      }
      return next;
    });
  }

  function handleFinancedAmount(v: string) {
    update("financed_amount", v);
  }

  function handleInstallments(v: string) {
    update("installments", v);
  }

  function handleTna(v: string) {
    update("tna", v);
  }

  // Plan de ahorro: auto-llena cuota inicial si está vacía.
  const savingsPlan = useMemo(() => {
    const total = Number(data.current_installment_value) || 0;
    const totalInstallments = Number(data.total_installments) || 0;
    const initial =
      Number(data.initial_installment) ||
      (totalInstallments > 0 && totals.total > 0
        ? totals.total / totalInstallments
        : 0);
    const adminFees = Number(data.administrative_fees) || 0;
    const planTotal =
      total * totalInstallments + adminFees + initial;
    return { total, totalInstallments, initial, adminFees, planTotal };
  }, [
    data.current_installment_value,
    data.total_installments,
    data.initial_installment,
    data.administrative_fees,
    totals.total,
  ]);

  function buildPayload(): QuoteInput {
    const modalityData: Record<string, string | number> = {};
    if (data.modality === "financed") {
      modalityData.down_payment = Number(data.down_payment) || 0;
      modalityData.financed_amount = Number(data.financed_amount) || 0;
      modalityData.installments = Number(data.installments) || 0;
      modalityData.tna = data.tna;
      modalityData.cft = data.cft;
      modalityData.installment_value = Number(data.installment_value) || 0;
    } else if (data.modality === "savings_plan") {
      modalityData.plan_name = data.plan_name;
      modalityData.total_installments = Number(data.total_installments) || 0;
      modalityData.initial_installment = Number(data.initial_installment) || 0;
      modalityData.current_installment_value =
        Number(data.current_installment_value) || 0;
      modalityData.administrative_fees =
        Number(data.administrative_fees) || 0;
    }

    return {
      lead_id: leadId,
      modality: data.modality,
      client_first_name: data.client_first_name,
      client_last_name: data.client_last_name,
      client_email: data.client_email,
      client_phone: data.client_phone,
      client_dni: data.client_dni,
      vehicle_brand: data.vehicle_brand,
      vehicle_model: data.vehicle_model,
      vehicle_version: data.vehicle_version,
      vehicle_year: data.vehicle_year,
      vehicle_color: data.vehicle_color,
      base_price: totals.base,
      discount: totals.disc,
      used_car_value: totals.used,
      modality_data: modalityData,
      valid_until: data.valid_until,
      notes: data.notes,
    };
  }

  function preview() {
    startTransition(async () => {
      const result = await previewQuote(buildPayload());
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPreviewUrl(result.dataUrl);
    });
  }

  function generate() {
    startTransition(async () => {
      const result = await createQuote(buildPayload());
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Presupuesto generado");
      router.push(`/sales/leads/${leadId}/quote/${result.quoteId}`);
    });
  }

  function pickPrice(value: string) {
    const found = prices.find((p) => p.id === value);
    if (found) {
      update("base_price", String(found.price));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Tabs
          value={data.modality}
          onValueChange={(v) => update("modality", v as Modality)}
        >
          <TabsList>
            <TabsTrigger value="cash">Contado</TabsTrigger>
            <TabsTrigger value="financed">Financiado</TabsTrigger>
            <TabsTrigger value="savings_plan">Plan de ahorro</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Nombre">
              <Input
                value={data.client_first_name}
                onChange={(e) =>
                  update("client_first_name", e.target.value)
                }
              />
            </Field>
            <Field label="Apellido">
              <Input
                value={data.client_last_name}
                onChange={(e) =>
                  update("client_last_name", e.target.value)
                }
              />
            </Field>
            <Field label="DNI">
              <Input
                value={data.client_dni}
                onChange={(e) => update("client_dni", e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={data.client_phone}
                onChange={(e) => update("client_phone", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={data.client_email}
                onChange={(e) => update("client_email", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vehículo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {prices.length > 0 && (
              <div>
                <Label className="text-xs">Cargar desde lista de precios</Label>
                <Select onValueChange={pickPrice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí un modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {prices.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} — {formatARS(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca">
                <Input
                  value={data.vehicle_brand}
                  onChange={(e) => update("vehicle_brand", e.target.value)}
                />
              </Field>
              <Field label="Modelo">
                <Input
                  value={data.vehicle_model}
                  onChange={(e) => update("vehicle_model", e.target.value)}
                />
              </Field>
              <Field label="Versión">
                <Input
                  value={data.vehicle_version}
                  onChange={(e) => update("vehicle_version", e.target.value)}
                />
              </Field>
              <Field label="Año">
                <Input
                  value={data.vehicle_year}
                  onChange={(e) => update("vehicle_year", e.target.value)}
                />
              </Field>
              <Field label="Color">
                <Input
                  value={data.vehicle_color}
                  onChange={(e) => update("vehicle_color", e.target.value)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cálculo</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <Field label="Precio base">
              <MoneyInput
                value={data.base_price}
                onValueChange={(v) => update("base_price", v)}
              />
            </Field>
            <Field label="Descuento">
              <MoneyInput
                value={data.discount}
                onValueChange={(v) => update("discount", v)}
              />
            </Field>
            <Field label="Auto usado">
              <MoneyInput
                value={data.used_car_value}
                onValueChange={(v) => update("used_car_value", v)}
              />
            </Field>
          </CardContent>
        </Card>

        {data.modality === "financed" && (
          <Card>
            <CardHeader>
              <CardTitle>Detalle financiado</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Anticipo">
                <MoneyInput
                  value={data.down_payment}
                  onValueChange={handleDownPayment}
                />
              </Field>
              <Field label="Monto a financiar">
                <MoneyInput
                  value={data.financed_amount}
                  onValueChange={handleFinancedAmount}
                />
              </Field>
              <Field label="Cuotas">
                <Input
                  type="number"
                  min={1}
                  value={data.installments}
                  onChange={(e) => handleInstallments(e.target.value)}
                />
              </Field>
              <Field label="Valor cuota">
                <MoneyInput
                  value={
                    data.installment_value ||
                    (finance.monthlyPayment > 0
                      ? String(Math.round(finance.monthlyPayment))
                      : "")
                  }
                  onValueChange={(v) => update("installment_value", v)}
                  placeholder={
                    finance.monthlyPayment > 0
                      ? `Sugerido: ${Math.round(finance.monthlyPayment).toLocaleString("es-AR")}`
                      : "—"
                  }
                />
              </Field>
              <Field label="TNA (%)">
                <Input
                  value={data.tna}
                  onChange={(e) => handleTna(e.target.value)}
                  placeholder="Ej: 75"
                />
              </Field>
              <Field label="CFT (%)">
                <Input
                  value={data.cft}
                  onChange={(e) => update("cft", e.target.value)}
                  placeholder="Ej: 95"
                />
              </Field>

              {(finance.installments > 0 ||
                finance.monthlyPayment > 0) && (
                <div className="col-span-2 mt-2 rounded-md border bg-muted/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumen del financiamiento
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <ResumenRow
                      label="Anticipo"
                      value={formatARS(finance.downPayment)}
                    />
                    <ResumenRow
                      label="Monto a financiar"
                      value={formatARS(finance.financedAmount)}
                    />
                    <ResumenRow
                      label={`Cuotas`}
                      value={`${finance.installments} × ${formatARS(finance.monthlyPayment)}`}
                    />
                    <ResumenRow
                      label="Intereses estimados"
                      value={formatARS(finance.totalInterest)}
                    />
                    <div className="col-span-2 mt-1 flex items-center justify-between border-t pt-2">
                      <span className="text-sm font-semibold">
                        Total a pagar
                      </span>
                      <span className="font-mono text-sm font-semibold text-accent">
                        {formatARS(finance.totalToPay)}
                      </span>
                    </div>
                    {finance.cftPct > 0 &&
                      finance.cftPct !== finance.tnaPct && (
                        <p className="col-span-2 text-[10px] text-muted-foreground">
                          CFT informado: {finance.cftPct}% (incluye gastos
                          administrativos e impositivos).
                        </p>
                      )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {data.modality === "savings_plan" && (
          <Card>
            <CardHeader>
              <CardTitle>Detalle plan de ahorro</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Nombre del plan">
                <Input
                  value={data.plan_name}
                  onChange={(e) => update("plan_name", e.target.value)}
                />
              </Field>
              <Field label="Cuotas totales">
                <Input
                  type="number"
                  min={1}
                  value={data.total_installments}
                  onChange={(e) =>
                    update("total_installments", e.target.value)
                  }
                />
              </Field>
              <Field label="Cuota inicial">
                <MoneyInput
                  value={data.initial_installment}
                  onValueChange={(v) => update("initial_installment", v)}
                />
              </Field>
              <Field label="Valor cuota actual">
                <MoneyInput
                  value={data.current_installment_value}
                  onValueChange={(v) =>
                    update("current_installment_value", v)
                  }
                />
              </Field>
              <Field label="Gastos administrativos">
                <MoneyInput
                  value={data.administrative_fees}
                  onValueChange={(v) => update("administrative_fees", v)}
                />
              </Field>

              {savingsPlan.totalInstallments > 0 && (
                <div className="col-span-2 mt-2 rounded-md border bg-muted/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumen del plan
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <ResumenRow
                      label="Cuotas totales"
                      value={String(savingsPlan.totalInstallments)}
                    />
                    <ResumenRow
                      label="Cuota inicial"
                      value={formatARS(savingsPlan.initial)}
                    />
                    <ResumenRow
                      label="Valor cuota actual"
                      value={formatARS(savingsPlan.total)}
                    />
                    <ResumenRow
                      label="Gastos administrativos"
                      value={formatARS(savingsPlan.adminFees)}
                    />
                    {savingsPlan.planTotal > 0 && (
                      <div className="col-span-2 mt-1 flex items-center justify-between border-t pt-2">
                        <span className="text-sm font-semibold">
                          Total estimado del plan
                        </span>
                        <span className="font-mono text-sm font-semibold text-accent">
                          {formatARS(savingsPlan.planTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Validez y notas</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Válido hasta">
              <Input
                type="date"
                value={data.valid_until}
                onChange={(e) => update("valid_until", e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Label className="text-xs">Observaciones</Label>
              <Textarea
                rows={3}
                value={data.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Precio base" value={totals.base} />
            <Row label="− Descuento" value={totals.disc} />
            <Row label="− Auto usado" value={totals.used} />
            <div className="mt-1 border-t pt-2 text-base font-semibold">
              <Row label="Total" value={totals.total} bold />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="outline" onClick={preview} disabled={pending}>
                <Eye className="mr-2 size-4" /> Vista previa
              </Button>
              <Button onClick={generate} disabled={pending || totals.total <= 0}>
                <FileCheck2 className="mr-2 size-4" />{" "}
                {pending ? "Generando…" : "Generar cotización"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!previewUrl}
        onOpenChange={(o) => !o && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="h-[70vh] w-full rounded-md border"
              title="Vista previa del presupuesto"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ResumenRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "" : "font-mono"}>{formatARS(value)}</span>
    </div>
  );
}

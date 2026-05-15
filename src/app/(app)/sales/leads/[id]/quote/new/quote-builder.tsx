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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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
                        {p.label} — $
                        {p.price.toLocaleString("es-AR")}
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
              <Input
                type="number"
                min={0}
                value={data.base_price}
                onChange={(e) => update("base_price", e.target.value)}
              />
            </Field>
            <Field label="Descuento">
              <Input
                type="number"
                min={0}
                value={data.discount}
                onChange={(e) => update("discount", e.target.value)}
              />
            </Field>
            <Field label="Auto usado">
              <Input
                type="number"
                min={0}
                value={data.used_car_value}
                onChange={(e) => update("used_car_value", e.target.value)}
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
                <Input
                  type="number"
                  min={0}
                  value={data.down_payment}
                  onChange={(e) => update("down_payment", e.target.value)}
                />
              </Field>
              <Field label="Monto a financiar">
                <Input
                  type="number"
                  min={0}
                  value={data.financed_amount}
                  onChange={(e) => update("financed_amount", e.target.value)}
                />
              </Field>
              <Field label="Cuotas">
                <Input
                  type="number"
                  min={1}
                  value={data.installments}
                  onChange={(e) => update("installments", e.target.value)}
                />
              </Field>
              <Field label="Valor cuota">
                <Input
                  type="number"
                  min={0}
                  value={data.installment_value}
                  onChange={(e) =>
                    update("installment_value", e.target.value)
                  }
                />
              </Field>
              <Field label="TNA (%)">
                <Input
                  value={data.tna}
                  onChange={(e) => update("tna", e.target.value)}
                />
              </Field>
              <Field label="CFT (%)">
                <Input
                  value={data.cft}
                  onChange={(e) => update("cft", e.target.value)}
                />
              </Field>
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
                <Input
                  type="number"
                  min={0}
                  value={data.initial_installment}
                  onChange={(e) =>
                    update("initial_installment", e.target.value)
                  }
                />
              </Field>
              <Field label="Valor cuota actual">
                <Input
                  type="number"
                  min={0}
                  value={data.current_installment_value}
                  onChange={(e) =>
                    update("current_installment_value", e.target.value)
                  }
                />
              </Field>
              <Field label="Gastos administrativos">
                <Input
                  type="number"
                  min={0}
                  value={data.administrative_fees}
                  onChange={(e) =>
                    update("administrative_fees", e.target.value)
                  }
                />
              </Field>
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
      <span className={bold ? "" : "font-mono"}>
        {value.toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
        })}
      </span>
    </div>
  );
}

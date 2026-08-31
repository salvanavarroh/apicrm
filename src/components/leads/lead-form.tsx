"use client";

import {
  AlertTriangle,
  Car,
  Check,
  CircleDashed,
  FileText,
  Sparkles,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CatalogCombobox } from "@/components/leads/catalog-combobox";
import {
  PendingInterests,
  type PendingInterest,
} from "@/components/leads/pending-interests";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

import { addLeadInterest } from "@/lib/lead-interests-actions";
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
  // Gerencias de quien carga. Si viene, sucursal+tipo pasan a ser obligatorios
  // y sólo se aceptan las combinaciones de la lista (gerente/supervisor).
  managedPairs?: ManagedPair[];
};

const EMPTY: LeadInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  city: "",
  vehicle_brand: "",
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

// ---------------------------------------------------------------------------
// Validación en el cliente.
//
// Antes la primera validación que veía el usuario era el round-trip al server,
// y el mensaje llegaba como un banner suelto sin decir qué campo estaba mal.
// Las reglas de acá son las mismas que ya aplica `leadInputSchema`; esto no
// reemplaza la validación del server, la anticipa.
// ---------------------------------------------------------------------------

type FieldKey =
  | "phone"
  | "email"
  | "budget_max"
  | "branch_id"
  | "product_type_id";
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_LABELS: Record<FieldKey, string> = {
  phone: "Teléfono",
  email: "Email",
  budget_max: "Presupuesto hasta",
  branch_id: "Sucursal",
  product_type_id: "Tipo de producto",
};

/** Orden en el que se recorren los errores para enfocar el primero. */
const FIELD_ORDER: FieldKey[] = [
  "phone",
  "email",
  "budget_max",
  "branch_id",
  "product_type_id",
];

const fieldId = (key: FieldKey | string) => `lf-${key}`;

const CONTACT_RULE = "Necesitás teléfono o email para poder contactarlo.";

/** Una gerencia: el par sucursal + tipo de producto que alguien maneja. */
export type ManagedPair = { branchId: string; productTypeId: string };

function validate(d: LeadInput, managed?: ManagedPair[]): FieldErrors {
  const errors: FieldErrors = {};

  const phone = String(d.phone ?? "").trim();
  const email = String(d.email ?? "").trim();
  if (!phone && !email) {
    errors.phone = CONTACT_RULE;
    errors.email = CONTACT_RULE;
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Revisá el formato del email.";
  }

  const min = Number(d.budget_min || 0);
  const max = Number(d.budget_max || 0);
  if (min > 0 && max > 0 && min > max) {
    errors.budget_max = 'No puede ser menor que "desde".';
  }

  // Gerente/supervisor: sucursal y tipo son OBLIGATORIOS y tienen que formar
  // una de sus gerencias. No es una regla de UI: la RLS de `leads` sólo lo deja
  // ver los leads cuyo par sucursal+tipo maneja, así que un lead sin clasificar
  // —o clasificado en un par que no maneja— no lo puede ni crear (Postgres
  // aborta el insert al no poder devolver la fila).
  if (managed) {
    const branch = String(d.branch_id ?? "");
    const type = String(d.product_type_id ?? "");
    if (!branch) {
      errors.branch_id = "Elegí una de las sucursales que manejás.";
    }
    if (!type) {
      errors.product_type_id = "Elegí uno de los tipos que manejás.";
    }
    if (
      branch &&
      type &&
      !managed.some((m) => m.branchId === branch && m.productTypeId === type)
    ) {
      errors.product_type_id =
        "No manejás esa combinación de sucursal y tipo de producto.";
    }
  }

  return errors;
}

export function LeadForm({
  mode,
  initial,
  branches,
  productTypes,
  campaigns,
  redirectTo,
  lockClassification,
  managedPairs,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<LeadInput>({ ...EMPTY, ...initial });
  // "Para romper el hielo" en el alta: se junta acá y se graba después de crear
  // el lead, porque los intereses necesitan un leadId que todavía no existe.
  const [interests, setInterests] = useState<PendingInterest[]>([]);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Sólo se muestran los errores después del primer intento de guardar: no
  // tiene sentido gritarle "falta el teléfono" a un formulario recién abierto.
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    setData((d) => {
      const next = { ...d, [key]: value };
      // Si ya se intentó guardar, revalidamos en vivo para que los errores
      // desaparezcan a medida que se corrigen.
      if (submitted) setErrors(validate(next, managedPairs));
      return next;
    });
  }

  // Dos cosas distintas, y confundirlas era el bug: los MENSAJES por campo sólo
  // se muestran después del primer intento (no hay que gritarle a un formulario
  // recién abierto), pero el ESTADO del footer se calcula siempre. Antes el
  // footer decía "Listo para guardar" con los obligatorios vacíos.
  const liveErrors = validate(data, managedPairs);
  const shownErrors = submitted ? errors : {};

  /** Nombres de campo a listar, contando phone+email como un solo problema. */
  function problemFields(errs: FieldErrors): string[] {
    return FIELD_ORDER.filter(
      (k) => errs[k] && (k !== "email" || errs.phone === undefined),
    ).map((k) => FIELD_LABELS[k]);
  }

  const liveProblems = problemFields(liveErrors);
  const blocking = liveProblems.length > 0;
  // "error" grita (ya intentó guardar), "pending" informa (todavía no).
  const footerState: "error" | "pending" | "ok" =
    blocking && submitted ? "error" : blocking ? "pending" : "ok";

  function focusFirstError(errs: FieldErrors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(fieldId(first));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
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
      // Los intereses se graban recién ahora, con el lead ya creado. Si alguno
      // falla no se tira atrás el lead: se avisa y el vendedor lo recarga desde
      // la ficha. Perder el lead por un dato de color sería peor.
      const newLeadId = "leadId" in result ? result.leadId : undefined;
      if (newLeadId && interests.length > 0) {
        const fallidos: string[] = [];
        for (const i of interests) {
          const r = await addLeadInterest({ leadId: newLeadId, ...i });
          if (!r.ok) fallidos.push(i.value);
        }
        if (fallidos.length > 0) {
          toast.warning(
            `El lead se creó, pero no pude guardar: ${fallidos.join(", ")}`,
          );
        }
      }
      toast.success(mode === "edit" ? "Lead actualizado" : "Lead creado");
      router.push(redirectTo);
      router.refresh();
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate(data, managedPairs);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    submit("auto");
  }

  // Numeración de los bloques: el de asignación comercial no siempre se muestra.
  // El bloque "Para romper el hielo" sólo existe en el alta: en la edición los
  // intereses ya se manejan desde la ficha, con su propia sección.
  const showInterests = mode === "create";
  const n = lockClassification
    ? { cliente: 1, vehiculo: 2, comercial: 0, hielo: showInterests ? 3 : 0, notas: showInterests ? 4 : 3 }
    : { cliente: 1, vehiculo: 2, comercial: 3, hielo: showInterests ? 4 : 0, notas: showInterests ? 5 : 4 };

  // Con gerencias, el tipo depende de la sucursal elegida: el par tiene que
  // existir en `managements`. Ofrecer los dos catálogos completos dejaba armar
  // combinaciones que el gerente no maneja, y eso reventaba igual contra la RLS.
  const typeOptions = managedPairs
    ? productTypes.filter((p) =>
        managedPairs.some(
          (m) =>
            m.productTypeId === p.id &&
            (!data.branch_id || m.branchId === data.branch_id),
        ),
      )
    : productTypes;

  /** Al cambiar de sucursal, un tipo que ya no forma gerencia se limpia. */
  function pickBranch(branchId: string) {
    setData((d) => {
      const type = String(d.product_type_id ?? "");
      const stillValid =
        !managedPairs ||
        !type ||
        managedPairs.some(
          (m) => m.branchId === branchId && m.productTypeId === type,
        );
      const next = {
        ...d,
        branch_id: branchId,
        product_type_id: stillValid ? d.product_type_id : "",
      };
      if (submitted) setErrors(validate(next, managedPairs));
      return next;
    });
  }

  const branchLabel = branches.find((b) => b.id === data.branch_id)?.label;
  const typeLabel = productTypes.find((p) => p.id === data.product_type_id)
    ?.label;
  const destination = [branchLabel, typeLabel].filter(Boolean).join(" · ");

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* ---------------- 1. Cliente ---------------- */}
      <FormBlock n={n.cliente} icon={User} title="Datos del cliente">
        <p className="flex items-start gap-2 rounded-md bg-info/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-info" />
          <span>
            Necesitás <strong className="font-semibold">al menos uno</strong> de
            los dos: teléfono o email. Sin eso no hay forma de contactarlo.
          </span>
        </p>
        <Grid2>
          <Field id="first_name" label="Nombre">
            <Input
              id={fieldId("first_name")}
              value={data.first_name ?? ""}
              onChange={(e) => update("first_name", e.target.value)}
              placeholder="Sandro"
            />
          </Field>
          <Field id="last_name" label="Apellido">
            <Input
              id={fieldId("last_name")}
              value={data.last_name ?? ""}
              onChange={(e) => update("last_name", e.target.value)}
              placeholder="Pérez"
            />
          </Field>
          <Field id="phone" label="Teléfono" required error={shownErrors.phone}>
            <Input
              id={fieldId("phone")}
              value={data.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+54 11 1234 5678"
              aria-invalid={Boolean(shownErrors.phone)}
              aria-describedby={
                shownErrors.phone ? `${fieldId("phone")}-err` : undefined
              }
            />
          </Field>
          <Field id="email" label="Email" required error={shownErrors.email}>
            <Input
              id={fieldId("email")}
              type="email"
              value={data.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="cliente@dominio.com"
              aria-invalid={Boolean(shownErrors.email)}
              aria-describedby={
                shownErrors.email ? `${fieldId("email")}-err` : undefined
              }
            />
          </Field>
          <Field id="city" label="Ciudad">
            <Input
              id={fieldId("city")}
              value={data.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Ramos Mejía"
            />
          </Field>
        </Grid2>
      </FormBlock>

      {/* ---------------- 2. Vehículo ---------------- */}
      <FormBlock n={n.vehiculo} icon={Car} title="Vehículo de interés">
        <Grid2>
          <Field id="vehicle_brand" label="Marca">
            <CatalogCombobox
              kind="brands"
              value={data.vehicle_brand ?? ""}
              onChange={(v) => {
                // Al cambiar la marca, reseteamos el modelo (cascada).
                setData((d) => ({ ...d, vehicle_brand: v, vehicle_model: "" }));
              }}
              placeholder="Ej: Volkswagen"
            />
          </Field>
          <Field
            id="vehicle_model"
            label="Modelo"
            hint={
              !data.vehicle_brand
                ? "Se filtra por la marca elegida"
                : undefined
            }
          >
            <CatalogCombobox
              kind="models"
              brand={data.vehicle_brand ?? ""}
              value={data.vehicle_model ?? ""}
              onChange={(v) => update("vehicle_model", v)}
              placeholder="Ej: Amarok"
            />
          </Field>
          <Field id="vehicle_version" label="Versión">
            <Input
              id={fieldId("vehicle_version")}
              value={data.vehicle_version ?? ""}
              onChange={(e) => update("vehicle_version", e.target.value)}
              placeholder="Ej: Comfortline TDI"
            />
          </Field>
          <Field id="preferred_color" label="Color preferido">
            <Input
              id={fieldId("preferred_color")}
              value={data.preferred_color ?? ""}
              onChange={(e) => update("preferred_color", e.target.value)}
              placeholder="Blanco perlado"
            />
          </Field>
        </Grid2>

        <Separator />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field id="declared_payment_method" label="Forma de pago">
            <Select
              value={(data.declared_payment_method as string) || ""}
              onValueChange={(v) =>
                update(
                  "declared_payment_method",
                  (v || "") as LeadInput["declared_payment_method"],
                )
              }
            >
              <SelectTrigger id={fieldId("declared_payment_method")}>
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
          <Field id="budget_min" label="Presupuesto desde">
            <MoneyInput
              id={fieldId("budget_min")}
              value={data.budget_min as string | number}
              onValueChange={(v) =>
                update("budget_min", v as LeadInput["budget_min"])
              }
            />
          </Field>
          <Field
            id="budget_max"
            label="Presupuesto hasta"
            error={shownErrors.budget_max}
          >
            <MoneyInput
              id={fieldId("budget_max")}
              value={data.budget_max as string | number}
              onValueChange={(v) =>
                update("budget_max", v as LeadInput["budget_max"])
              }
              aria-invalid={Boolean(shownErrors.budget_max)}
              aria-describedby={
                shownErrors.budget_max
                  ? `${fieldId("budget_max")}-err`
                  : undefined
              }
              className={
                shownErrors.budget_max ? "border-destructive" : undefined
              }
            />
          </Field>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Checkbox
              checked={data.has_used_car ?? false}
              onCheckedChange={(v) => update("has_used_car", Boolean(v))}
            />
            Entrega un usado en parte de pago
          </label>

          {data.has_used_car && (
            <Field
              id="used_car_description"
              label="Qué entrega"
              hint="Con marca, modelo, año y kilometraje alcanza para que el tasador arranque."
            >
              <Textarea
                id={fieldId("used_car_description")}
                value={data.used_car_description ?? ""}
                onChange={(e) => update("used_car_description", e.target.value)}
                rows={2}
                placeholder="Corolla XEI 2018, 90.000 km, único dueño"
              />
            </Field>
          )}
        </div>
      </FormBlock>

      {/* ---------------- 3. Asignación comercial ---------------- */}
      {!lockClassification && (
        <FormBlock n={n.comercial} icon={Target} title="Asignación comercial">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              id="branch_id"
              label="Sucursal"
              required={Boolean(managedPairs)}
              error={shownErrors.branch_id}
            >
              <Select
                value={data.branch_id ?? ""}
                onValueChange={(v) => pickBranch(v)}
              >
                <SelectTrigger id={fieldId("branch_id")}>
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
            <Field
              id="product_type_id"
              label="Tipo de producto"
              required={Boolean(managedPairs)}
              error={shownErrors.product_type_id}
            >
              <Select
                value={data.product_type_id ?? ""}
                onValueChange={(v) => update("product_type_id", v)}
              >
                <SelectTrigger id={fieldId("product_type_id")}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="campaign_id" label="Campaña">
              <Select
                value={data.campaign_id ?? ""}
                onValueChange={(v) => update("campaign_id", v)}
              >
                <SelectTrigger id={fieldId("campaign_id")}>
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
          </div>
          <p className="text-[11px] text-muted-foreground">
            {managedPairs
              ? "Sucursal y tipo son obligatorios: el lead tiene que quedar dentro de una de tus gerencias, si no no lo podrías ver."
              : "Si dejás sucursal o tipo en blanco, el lead cae en “Sin clasificar” y no se auto-asigna a ningún vendedor."}
          </p>
        </FormBlock>
      )}

      {/* ---------------- Para romper el hielo ---------------- */}
      {showInterests && (
        <FormBlock n={n.hielo} icon={Sparkles} title="Para romper el hielo">
          <PendingInterests value={interests} onChange={setInterests} />
        </FormBlock>
      )}

      {/* ---------------- Notas ---------------- */}
      <FormBlock n={n.notas} icon={FileText} title="Notas iniciales">
        <Field id="initial_notes" label="Qué dijo el cliente">
          <Textarea
            id={fieldId("initial_notes")}
            value={data.initial_notes ?? ""}
            onChange={(e) => update("initial_notes", e.target.value)}
            rows={3}
            placeholder="Pidió precio de la SRV 4x4 y si toman el usado. Vuelve a llamar el lunes."
          />
        </Field>
      </FormBlock>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ---------------- Footer sticky ---------------- */}
      <div
        className={cn(
          "sticky bottom-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3",
          "rounded-xl border p-3 shadow-lg backdrop-blur-md",
          footerState === "error"
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card/95",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {footerState === "error" && (
            <>
              <span className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full bg-destructive px-2.5 text-xs font-bold text-destructive-foreground">
                <AlertTriangle className="size-3.5" />
                {liveProblems.length}
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                Revisá {liveProblems.join(" y ")}
              </span>
              <button
                type="button"
                onClick={() => focusFirstError(liveErrors)}
                className="shrink-0 text-xs font-bold text-destructive underline underline-offset-2"
              >
                Ir al primero
              </button>
            </>
          )}

          {footerState === "pending" && (
            <>
              <span className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CircleDashed className="size-3.5" />
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                Falta {liveProblems.join(" y ")} para poder guardar
              </span>
            </>
          )}

          {footerState === "ok" && (
            <>
              <span className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {mode === "edit"
                  ? "Listo para guardar los cambios."
                  : destination
                    ? `Listo para guardar · se asigna a ${destination}`
                    : "Listo para guardar."}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 max-[520px]:w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(redirectTo)}
            disabled={pending}
            className="max-[520px]:flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="max-[520px]:flex-1"
          >
            {pending
              ? "Guardando…"
              : mode === "edit"
                ? "Guardar cambios"
                : "Crear lead"}
          </Button>
        </div>
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
            <Button onClick={() => submit("skip_check")} disabled={pending}>
              Crear igual (lead nuevo)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/**
 * Bloque del formulario: una Card con número y ícono de acento.
 *
 * Antes cada grupo era un `<h3>` suelto seguido de los campos, así que el
 * formulario se leía como una única corrida gris de 15 inputs.
 */
function FormBlock({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-bold text-accent">
          {n}
        </span>
        <Icon className="size-4 text-accent" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function Separator() {
  return <div className="h-px bg-border" aria-hidden />;
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId(id)} className="text-xs font-semibold">
        {label}
        {required && (
          <span className="font-bold text-accent" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p
          id={`${fieldId(id)}-err`}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive"
        >
          <AlertTriangle className="size-3 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

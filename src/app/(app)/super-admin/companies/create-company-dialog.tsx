"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Stepper } from "@/components/stepper";

import { createCompanyWithAdmin } from "./actions";

const companySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
});

const billingSchema = z.object({
  cuit: z.string().optional(),
  legal_name: z.string().optional(),
  monthly_price: z.string().optional(),
  subscription_starts_at: z.string().optional(),
  subscription_ends_at: z.string().optional(),
});

const adminSchema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio"),
  last_name: z.string().min(1, "Apellido obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
});

type CompanyData = z.infer<typeof companySchema>;
type BillingData = z.infer<typeof billingSchema>;
type AdminData = z.infer<typeof adminSchema>;

const STEPS = [
  { label: "Concesionaria" },
  { label: "Facturación" },
  { label: "Administrador" },
] as const;

const emptyCompany: CompanyData = { name: "", address: "", city: "", phone: "" };
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysIso(base: string, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const initialStart = todayIso();
const emptyBilling: BillingData = {
  cuit: "",
  legal_name: "",
  monthly_price: "",
  subscription_starts_at: initialStart,
  subscription_ends_at: plusDaysIso(initialStart, 30),
};
const emptyAdmin: AdminData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
};

export function CreateCompanyDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<CompanyData>(emptyCompany);
  const [billing, setBilling] = useState<BillingData>(emptyBilling);
  const [admin, setAdmin] = useState<AdminData>(emptyAdmin);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep(0);
    setCompany(emptyCompany);
    setBilling(emptyBilling);
    setAdmin(emptyAdmin);
    setErrors({});
    setSubmitError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function validateAndNext() {
    setSubmitError(null);
    const res =
      step === 0
        ? companySchema.safeParse(company)
        : step === 1
          ? billingSchema.safeParse(billing)
          : adminSchema.safeParse(admin);

    if (!res.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of res.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function handleNext() {
    if (!validateAndNext()) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    setErrors({});
    setSubmitError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createCompanyWithAdmin({
        company,
        billing,
        admin,
      });
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      toast.success(
        `Concesionaria "${result.companyName}" creada. Invitación enviada a ${result.adminEmail}.`,
      );
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-lg p-0">
        <div className="flex flex-col gap-6 px-6 pt-7 pb-6">
          <Stepper steps={[...STEPS]} current={step} />

          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-2xl font-bold">
              {step === 0 && "Alta de concesionaria"}
              {step === 1 && "Datos de facturación"}
              {step === 2 && "Asignación de Admin"}
            </DialogTitle>
          </DialogHeader>

          {step === 0 && (
            <CompanyStep data={company} setData={setCompany} errors={errors} />
          )}
          {step === 1 && (
            <BillingStep data={billing} setData={setBilling} errors={errors} />
          )}
          {step === 2 && (
            <AdminStep data={admin} setData={setAdmin} errors={errors} />
          )}

          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {step === 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                disabled={pending}
              >
                <ChevronLeft className="mr-1 size-4" /> Volver
              </Button>
            )}

            <Button
              type="button"
              onClick={handleNext}
              className="flex-1"
              disabled={pending}
            >
              {step === STEPS.length - 1
                ? pending
                  ? "Guardando…"
                  : "Guardar"
                : "Continuar"}
              {step < STEPS.length - 1 && <ChevronRight className="ml-1 size-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CompanyStep({
  data,
  setData,
  errors,
}: {
  data: CompanyData;
  setData: (d: CompanyData) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nombre" error={errors.name}>
        <Input
          placeholder="Nombre"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
        />
      </Field>
      <Field label="Dirección" error={errors.address}>
        <Input
          placeholder="Dirección"
          value={data.address ?? ""}
          onChange={(e) => setData({ ...data, address: e.target.value })}
        />
      </Field>
      <Field label="Ciudad" error={errors.city}>
        <Input
          placeholder="Ciudad"
          value={data.city ?? ""}
          onChange={(e) => setData({ ...data, city: e.target.value })}
        />
      </Field>
      <Field label="Número de teléfono" error={errors.phone}>
        <Input
          placeholder="Número de teléfono"
          value={data.phone ?? ""}
          onChange={(e) => setData({ ...data, phone: e.target.value })}
        />
      </Field>
    </div>
  );
}

function BillingStep({
  data,
  setData,
  errors,
}: {
  data: BillingData;
  setData: (d: BillingData) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Número de CUIT" error={errors.cuit}>
        <Input
          placeholder="Número de CUIT"
          value={data.cuit ?? ""}
          onChange={(e) => setData({ ...data, cuit: e.target.value })}
        />
      </Field>
      <Field label="Razón social" error={errors.legal_name}>
        <Input
          placeholder="Razón social"
          value={data.legal_name ?? ""}
          onChange={(e) => setData({ ...data, legal_name: e.target.value })}
        />
      </Field>
      <Field label="Precio mensual a cobrar" error={errors.monthly_price}>
        <MoneyInput
          placeholder="0"
          value={data.monthly_price ?? ""}
          onValueChange={(v) =>
            setData({ ...data, monthly_price: v })
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Fecha de alta"
          error={errors.subscription_starts_at}
        >
          <Input
            type="date"
            value={data.subscription_starts_at ?? ""}
            onChange={(e) => {
              const start = e.target.value;
              setData({
                ...data,
                subscription_starts_at: start,
                // Auto-calc: si el usuario no editó el vencimiento manualmente
                // (o lo dejó vacío), reemplazamos por start + 30d.
                subscription_ends_at: start ? plusDaysIso(start, 30) : "",
              });
            }}
          />
        </Field>
        <Field
          label="Fecha de vencimiento"
          error={errors.subscription_ends_at}
        >
          <Input
            type="date"
            value={data.subscription_ends_at ?? ""}
            onChange={(e) =>
              setData({ ...data, subscription_ends_at: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}

function AdminStep({
  data,
  setData,
  errors,
}: {
  data: AdminData;
  setData: (d: AdminData) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nombre" error={errors.first_name}>
        <Input
          placeholder="Nombre"
          value={data.first_name}
          onChange={(e) => setData({ ...data, first_name: e.target.value })}
        />
      </Field>
      <Field label="Apellido" error={errors.last_name}>
        <Input
          placeholder="Apellido"
          value={data.last_name}
          onChange={(e) => setData({ ...data, last_name: e.target.value })}
        />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input
          type="email"
          placeholder="Email"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
        />
      </Field>
      <Field label="Número de teléfono" error={errors.phone}>
        <Input
          placeholder="Número de teléfono"
          value={data.phone ?? ""}
          onChange={(e) => setData({ ...data, phone: e.target.value })}
        />
      </Field>
    </div>
  );
}

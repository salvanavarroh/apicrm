import Papa from "papaparse";
import { z } from "zod";

import type { Database } from "@/types/database";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type LeadPaymentMethod = Database["public"]["Enums"]["lead_payment_method"];
export type LeadTemperature = Database["public"]["Enums"]["lead_temperature"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  quoted: "Presupuestado",
  evaluating: "Evaluando",
  accepted: "Aprobado",
  rejected: "Rechazado",
  closed: "Cerrado",
  not_interested: "No interesado",
};

export const LEAD_STATUS_TONE: Record<
  LeadStatus,
  "info" | "warning" | "success" | "muted" | "danger"
> = {
  new: "info",
  contacted: "warning",
  interested: "success",
  quoted: "success",
  evaluating: "warning",
  accepted: "success",
  rejected: "danger",
  closed: "muted",
  not_interested: "muted",
};

// Scoring manual: temperatura asignada por el vendedor. Distinto del semáforo
// de gestión (ese es automático por días sin movimiento).
export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  hot: "Caliente",
  warm: "Tibio",
  cold: "Frío",
};

// Emoji + clases de color para el badge de temperatura.
export const LEAD_TEMPERATURE_META: Record<
  LeadTemperature,
  { emoji: string; badge: string; dot: string }
> = {
  hot: {
    emoji: "🔥",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
  warm: {
    emoji: "🟡",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  cold: {
    emoji: "🔵",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
};

export const LEAD_TEMPERATURE_OPTIONS = (
  Object.keys(LEAD_TEMPERATURE_LABELS) as LeadTemperature[]
).map((value) => ({ value, label: LEAD_TEMPERATURE_LABELS[value] }));

export const LEAD_PAYMENT_LABELS: Record<LeadPaymentMethod, string> = {
  cash: "Contado",
  financed: "Financiado",
  savings_plan: "Plan de ahorro",
  used_car: "Auto en parte de pago",
  other: "Otro",
};

export const LEAD_PAYMENT_OPTIONS = (
  Object.keys(LEAD_PAYMENT_LABELS) as LeadPaymentMethod[]
).map((value) => ({ value, label: LEAD_PAYMENT_LABELS[value] }));

const optionalString = z.string().optional().or(z.literal(""));
const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalNumber = z
  .union([z.coerce.number().nonnegative(), z.literal("")])
  .optional();
const optionalPayment = z
  .union([
    z.enum(["cash", "financed", "savings_plan", "used_car", "other"]),
    z.literal(""),
  ])
  .optional();

export const leadInputSchema = z
  .object({
    first_name: optionalString,
    last_name: optionalString,
    email: z
      .string()
      .email("Email inválido")
      .optional()
      .or(z.literal("")),
    phone: optionalString,
    city: optionalString,
    vehicle_model: optionalString,
    vehicle_version: optionalString,
    preferred_color: optionalString,
    budget_min: optionalNumber,
    budget_max: optionalNumber,
    has_used_car: z.boolean().optional(),
    used_car_description: optionalString,
    declared_payment_method: optionalPayment,
    campaign_id: optionalUuid,
    branch_id: optionalUuid,
    product_type_id: optionalUuid,
    initial_notes: optionalString,
  })
  .refine((d) => Boolean(d.phone) || Boolean(d.email), {
    message: "Al menos teléfono o email es obligatorio",
    path: ["phone"],
  });

export type LeadInput = z.input<typeof leadInputSchema>;

export const CSV_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "vehicle_model",
  "vehicle_version",
  "preferred_color",
  "budget_min",
  "budget_max",
  "has_used_car",
  "used_car_description",
  "declared_payment_method",
  "initial_notes",
] as const;

export type CsvHeader = (typeof CSV_HEADERS)[number];

export const CSV_HEADER_LABELS: Record<CsvHeader, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  email: "Email",
  phone: "Teléfono",
  city: "Ciudad",
  vehicle_model: "Modelo",
  vehicle_version: "Versión",
  preferred_color: "Color",
  budget_min: "Presupuesto mínimo",
  budget_max: "Presupuesto máximo",
  has_used_car: "Tiene usado",
  used_car_description: "Descripción usado",
  declared_payment_method: "Forma de pago",
  initial_notes: "Notas",
};

export type CsvRow = Partial<Record<CsvHeader, string>>;

export function parseCsv(text: string): {
  rows: CsvRow[];
  headers: string[];
  errors: string[];
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const errors = result.errors.map(
    (e) => `Línea ${(e.row ?? 0) + 2}: ${e.message}`,
  );
  const headers = result.meta.fields ?? [];
  const rows: CsvRow[] = (result.data ?? []).map((raw) => {
    const out: CsvRow = {};
    for (const h of CSV_HEADERS) {
      const value = raw[h];
      if (typeof value === "string" && value.length > 0) {
        out[h] = value.trim();
      }
    }
    return out;
  });

  return { rows, headers, errors };
}

export function validateCsvRow(row: CsvRow): string[] {
  const errors: string[] = [];
  if (!row.phone && !row.email) {
    errors.push("Falta teléfono o email");
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push("Email inválido");
  }
  if (row.declared_payment_method) {
    const valid = ["cash", "financed", "savings_plan", "used_car", "other"];
    if (!valid.includes(row.declared_payment_method)) {
      errors.push(`Forma de pago inválida: ${row.declared_payment_method}`);
    }
  }
  if (row.budget_min && Number.isNaN(Number(row.budget_min))) {
    errors.push("Presupuesto mínimo no es número");
  }
  if (row.budget_max && Number.isNaN(Number(row.budget_max))) {
    errors.push("Presupuesto máximo no es número");
  }
  return errors;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned.length === 0 ? null : cleaned;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return [f, l].filter(Boolean).join(" ") || "—";
}

export function isPoolLead(lead: {
  branch_id: string | null;
  product_type_id: string | null;
}) {
  return lead.branch_id === null || lead.product_type_id === null;
}

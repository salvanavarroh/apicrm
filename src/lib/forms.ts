import { z } from "zod";

import type { Database } from "@/types/database";

export type LeadCaptureForm =
  Database["public"]["Tables"]["lead_capture_forms"]["Row"];

export const FIELD_KEYS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "city",
  "vehicle_model",
  "initial_notes",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export type FieldConfig = {
  label: string;
  placeholder: string;
  required: boolean;
};

export type FieldsConfig = Record<FieldKey, FieldConfig>;

export const DEFAULT_FIELDS: FieldsConfig = {
  first_name: {
    label: "Nombre",
    placeholder: "Tu nombre",
    required: true,
  },
  last_name: {
    label: "Apellido",
    placeholder: "Tu apellido",
    required: false,
  },
  phone: {
    label: "Teléfono",
    placeholder: "+54 11 1234 5678",
    required: true,
  },
  email: {
    label: "Email",
    placeholder: "tu@email.com",
    required: false,
  },
  city: {
    label: "Ciudad",
    placeholder: "Buenos Aires",
    required: false,
  },
  vehicle_model: {
    label: "Vehículo de interés",
    placeholder: "Ej: Civic Hybrid",
    required: false,
  },
  initial_notes: {
    label: "Notas",
    placeholder: "Contanos más",
    required: false,
  },
};

export const FIELD_LABELS_DEFAULT: Record<FieldKey, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  phone: "Teléfono",
  email: "Email",
  city: "Ciudad",
  vehicle_model: "Vehículo de interés",
  initial_notes: "Notas",
};

export function parseFields(raw: unknown): FieldsConfig {
  const merged: FieldsConfig = { ...DEFAULT_FIELDS };
  if (!raw || typeof raw !== "object") return merged;
  const obj = raw as Record<string, unknown>;
  for (const k of FIELD_KEYS) {
    const cell = obj[k];
    if (cell && typeof cell === "object") {
      const c = cell as Record<string, unknown>;
      merged[k] = {
        label: typeof c.label === "string" ? c.label : DEFAULT_FIELDS[k].label,
        placeholder:
          typeof c.placeholder === "string"
            ? c.placeholder
            : DEFAULT_FIELDS[k].placeholder,
        required:
          typeof c.required === "boolean"
            ? c.required
            : DEFAULT_FIELDS[k].required,
      };
    }
  }
  return merged;
}

// 8-char slug alfanumérico (lowercase) sin caracteres confundibles (0, O, l, I, 1).
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateSlug(length = 8): string {
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (const v of arr) out += SLUG_ALPHABET[v % SLUG_ALPHABET.length];
  return out;
}

// ============================================================================
// Schemas para crear/editar form en el CRM
// ============================================================================

const fieldConfigSchema = z.object({
  label: z.string().min(1).max(80),
  placeholder: z.string().max(120).default(""),
  required: z.boolean(),
});

export const formInputSchema = z.object({
  name: z.string().min(1, "Ponele un nombre interno").max(80),
  branch_id: z.string().uuid("Elegí una sucursal"),
  product_type_id: z.string().uuid("Elegí un tipo de producto"),
  campaign_id: z.string().uuid().optional().or(z.literal("")),

  status: z.enum(["active", "inactive"]).default("active"),

  title: z.string().min(1, "El título no puede estar vacío").max(120),
  subtitle: z.string().max(280).optional().or(z.literal("")),
  submit_label: z.string().min(1).max(40).default("Enviar"),
  success_message: z.string().min(1).max(280),

  logo_url: z.string().url().optional().or(z.literal("")),
  banner_url: z.string().url().optional().or(z.literal("")),
  primary_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "Color hex inválido"),

  fields: z.object({
    first_name: fieldConfigSchema,
    last_name: fieldConfigSchema,
    phone: fieldConfigSchema,
    email: fieldConfigSchema,
    city: fieldConfigSchema,
    vehicle_model: fieldConfigSchema,
    initial_notes: fieldConfigSchema,
  }),
});

export type FormInput = z.input<typeof formInputSchema>;

// ============================================================================
// Schema para submission pública
// ============================================================================

export const submissionSchema = z.object({
  first_name: z.string().optional().or(z.literal("")),
  last_name: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  vehicle_model: z.string().optional().or(z.literal("")),
  initial_notes: z.string().optional().or(z.literal("")),
  // Honeypot: si tiene valor, es un bot. Debe estar vacío.
  website: z.string().optional().or(z.literal("")),
});

export type SubmissionInput = z.input<typeof submissionSchema>;

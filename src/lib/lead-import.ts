// ============================================================================
// Carga de leads con IA — núcleo compartido (cliente + server).
//
// La IA mapea el ESQUEMA (columna del archivo → campo destino), no fila por
// fila. Este módulo define el catálogo de campos destino y aplica ese mapeo de
// forma DETERMINÍSTICA a todas las filas: coerción de tipos, validación y dedup
// en archivo. Ver docs/carga-leads-ia.md.
// ============================================================================

import { normalizeEmail, normalizePhone } from "@/lib/leads";
import type { Database } from "@/types/database";

type LeadPaymentMethod = Database["public"]["Enums"]["lead_payment_method"];

// Pseudo-destinos que no son una columna de `leads`:
//  - full_name → se parte en first_name + last_name
//  - metadata  → va al jsonb comodín (columnas estructuradas desconocidas)
//  - ignore    → se descarta
export const SPECIAL_TARGETS = ["full_name", "metadata", "ignore"] as const;

export type TargetFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "boolean"
  | "payment"
  | "date"
  | "datetime"
  | "notes";

export type TargetField = {
  key: string;
  label: string;
  group: string;
  type: TargetFieldType;
  /** Descripción para el prompt de la IA (qué contenido va acá). */
  hint: string;
};

// Catálogo de campos destino reales de `leads` (los que puede completar la IA).
export const TARGET_FIELDS: TargetField[] = [
  { key: "first_name", label: "Nombre", group: "Persona", type: "text", hint: "Nombre de pila del contacto" },
  { key: "last_name", label: "Apellido", group: "Persona", type: "text", hint: "Apellido del contacto" },
  { key: "email", label: "Email", group: "Contacto", type: "email", hint: "Correo electrónico" },
  { key: "phone", label: "Teléfono", group: "Contacto", type: "phone", hint: "Teléfono / celular / WhatsApp" },
  { key: "national_id", label: "DNI / CUIT", group: "Persona", type: "text", hint: "Documento (DNI, CUIT, CUIL)" },
  { key: "birth_date", label: "Fecha de nacimiento", group: "Persona", type: "date", hint: "Fecha de nacimiento" },
  { key: "city", label: "Ciudad", group: "Ubicación", type: "text", hint: "Ciudad" },
  { key: "locality", label: "Localidad", group: "Ubicación", type: "text", hint: "Localidad / barrio / partido" },
  { key: "province", label: "Provincia", group: "Ubicación", type: "text", hint: "Provincia / estado / región" },
  { key: "preferred_contact_time", label: "Horario de contacto", group: "Contacto", type: "text", hint: "Franja horaria preferida para contactar" },
  { key: "vehicle_brand", label: "Marca", group: "Vehículo", type: "text", hint: "Marca del vehículo de interés" },
  { key: "vehicle_model", label: "Modelo", group: "Vehículo", type: "text", hint: "Modelo del vehículo de interés" },
  { key: "vehicle_version", label: "Versión", group: "Vehículo", type: "text", hint: "Versión / terminación del vehículo" },
  { key: "preferred_color", label: "Color", group: "Vehículo", type: "text", hint: "Color preferido" },
  { key: "budget_min", label: "Presupuesto mínimo", group: "Comercial", type: "number", hint: "Presupuesto mínimo (número)" },
  { key: "budget_max", label: "Presupuesto máximo", group: "Comercial", type: "number", hint: "Presupuesto máximo (número)" },
  { key: "has_used_car", label: "Tiene usado", group: "Comercial", type: "boolean", hint: "Si entrega un usado en parte de pago (sí/no)" },
  { key: "used_car_description", label: "Descripción del usado", group: "Comercial", type: "text", hint: "Datos del usado que entrega" },
  { key: "declared_payment_method", label: "Forma de pago", group: "Comercial", type: "payment", hint: "Forma de pago declarada: contado, financiado, plan de ahorro, usado en parte de pago, otro" },
  { key: "initial_notes", label: "Notas", group: "Otros", type: "notes", hint: "Texto libre / consulta / comentarios humanos" },
  { key: "source", label: "Origen", group: "Trazabilidad", type: "text", hint: "Nombre legible de la fuente (ej. Meta Lead Ads)" },
  { key: "external_id", label: "ID en la fuente", group: "Trazabilidad", type: "text", hint: "Identificador del lead en la fuente (para dedup)" },
  { key: "source_created_at", label: "Fecha en la fuente", group: "Trazabilidad", type: "datetime", hint: "Fecha/hora en que se generó el lead en la fuente" },
  { key: "utm_source", label: "UTM source", group: "Marketing", type: "text", hint: "Plataforma / origen de tráfico (utm_source)" },
  { key: "utm_medium", label: "UTM medium", group: "Marketing", type: "text", hint: "Medio (utm_medium)" },
  { key: "utm_campaign", label: "UTM campaign", group: "Marketing", type: "text", hint: "Campaña (utm_campaign)" },
  { key: "utm_term", label: "UTM term", group: "Marketing", type: "text", hint: "Término / segmento (utm_term)" },
  { key: "utm_content", label: "UTM content", group: "Marketing", type: "text", hint: "Anuncio / contenido (utm_content)" },
  { key: "landing_url", label: "Landing URL", group: "Marketing", type: "text", hint: "URL de aterrizaje" },
  { key: "referrer", label: "Referrer", group: "Marketing", type: "text", hint: "URL de referencia" },
];

export const TARGET_FIELD_MAP: Record<string, TargetField> = Object.fromEntries(
  TARGET_FIELDS.map((f) => [f.key, f]),
);

// Etiquetas legibles para los pseudo-destinos + campos, usadas en la UI.
export const TARGET_LABELS: Record<string, string> = {
  ...Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, f.label])),
  full_name: "Nombre completo (se divide)",
  metadata: "Metadata (columna extra)",
  ignore: "Ignorar",
};

export function isKnownTarget(target: string): boolean {
  return (
    target in TARGET_FIELD_MAP ||
    (SPECIAL_TARGETS as readonly string[]).includes(target)
  );
}

// ----------------------------------------------------------------------------
// Tipos del mapeo (lo que devuelve la IA y lo que edita el usuario).
// ----------------------------------------------------------------------------

export type ColumnMapping = {
  source: string; // header tal cual viene en el archivo
  target: string; // key de TARGET_FIELDS | full_name | metadata | ignore
  confidence: number; // 0..1
  note?: string;
};

export type LeadMapping = {
  columns: ColumnMapping[];
  notes?: string; // observaciones generales de la IA
};

// ----------------------------------------------------------------------------
// Resultado de aplicar el mapeo a una fila.
// ----------------------------------------------------------------------------

export type MappedRowStatus = "ok" | "warning" | "error" | "duplicate";

// Datos ya coercionados listos para insertar (subconjunto de leads).
export type MappedLeadData = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  locality: string | null;
  province: string | null;
  national_id: string | null;
  birth_date: string | null;
  preferred_contact_time: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_version: string | null;
  preferred_color: string | null;
  budget_min: number | null;
  budget_max: number | null;
  has_used_car: boolean;
  used_car_description: string | null;
  declared_payment_method: LeadPaymentMethod | null;
  initial_notes: string | null;
  source: string | null;
  external_id: string | null;
  source_created_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_url: string | null;
  referrer: string | null;
  metadata: Record<string, string> | null;
};

export type MappedRow = {
  index: number; // índice de la fila en el archivo (0-based)
  data: MappedLeadData;
  status: MappedRowStatus;
  errors: string[]; // problemas fatales
  warnings: string[]; // problemas no fatales
  dupKey: string | null; // clave usada para dedup (external_id/phone/email)
};

export type ApplyResult = {
  rows: MappedRow[];
  stats: {
    total: number;
    ok: number;
    warning: number;
    error: number;
    duplicate: number;
  };
};

// ----------------------------------------------------------------------------
// Coerciones de tipo.
// ----------------------------------------------------------------------------

function coerceNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Formato AR: puntos = miles, coma = decimal → "1.500.000,50"
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    // Solo coma: la tratamos como decimal.
    normalized = cleaned.replace(",", ".");
  } else if (cleaned.includes(".")) {
    // Solo puntos: si parecen separadores de miles (grupos de 3), los sacamos.
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, "");
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const TRUE_WORDS = new Set([
  "true",
  "1",
  "si",
  "sí",
  "yes",
  "y",
  "x",
  "verdadero",
  "t",
]);

function coerceBoolean(raw: string): boolean {
  return TRUE_WORDS.has(raw.trim().toLowerCase());
}

function coercePayment(raw: string): LeadPaymentMethod | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/(contado|cash|efectivo)/.test(v)) return "cash";
  if (/(financ|cr[eé]dito|prendario|cuotas?)/.test(v)) return "financed";
  if (/(plan|ahorro|savings)/.test(v)) return "savings_plan";
  if (/(usado|permuta|parte de pago|used|canje)/.test(v)) return "used_car";
  return "other";
}

// dd/mm/yyyy o dd-mm-yyyy → yyyy-mm-dd; si no, deja que Date lo intente.
function toDate(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date;
}

function coerceDate(raw: string): string | null {
  const d = toDate(raw);
  if (!d) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function coerceDateTime(raw: string): string | null {
  const d = toDate(raw);
  return d ? d.toISOString() : null;
}

// ----------------------------------------------------------------------------
// Aplicar el mapeo a todas las filas.
// ----------------------------------------------------------------------------

function emptyData(): MappedLeadData {
  return {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    city: null,
    locality: null,
    province: null,
    national_id: null,
    birth_date: null,
    preferred_contact_time: null,
    vehicle_brand: null,
    vehicle_model: null,
    vehicle_version: null,
    preferred_color: null,
    budget_min: null,
    budget_max: null,
    has_used_car: false,
    used_car_description: null,
    declared_payment_method: null,
    initial_notes: null,
    source: null,
    external_id: null,
    source_created_at: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    landing_url: null,
    referrer: null,
    metadata: null,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitFullName(value: string): { first: string; last: string | null } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function applyRow(
  raw: Record<string, string>,
  mapping: LeadMapping,
  index: number,
): MappedRow {
  const data = emptyData();
  const warnings: string[] = [];
  const errors: string[] = [];
  const notesParts: string[] = [];
  const metadata: Record<string, string> = {};

  for (const col of mapping.columns) {
    if (col.target === "ignore") continue;
    const value = (raw[col.source] ?? "").trim();
    if (!value) continue;

    if (col.target === "metadata") {
      metadata[col.source] = value;
      continue;
    }
    if (col.target === "full_name") {
      const { first, last } = splitFullName(value);
      if (!data.first_name) data.first_name = first || null;
      if (last && !data.last_name) data.last_name = last;
      continue;
    }

    const field = TARGET_FIELD_MAP[col.target];
    if (!field) {
      // Destino desconocido → lo guardamos como metadata para no perder el dato.
      metadata[col.source] = value;
      continue;
    }

    switch (field.type) {
      case "email": {
        const email = normalizeEmail(value);
        if (email && !EMAIL_RE.test(email)) {
          warnings.push(`Email dudoso: ${value}`);
        }
        if (!data.email) data.email = email;
        break;
      }
      case "phone":
        if (!data.phone) data.phone = normalizePhone(value);
        break;
      case "number": {
        const n = coerceNumber(value);
        if (n === null) {
          warnings.push(`No pude leer un número en "${field.label}": ${value}`);
        } else {
          (data as Record<string, unknown>)[field.key] = n;
        }
        break;
      }
      case "boolean":
        (data as Record<string, unknown>)[field.key] = coerceBoolean(value);
        break;
      case "payment": {
        const pm = coercePayment(value);
        data.declared_payment_method = pm;
        break;
      }
      case "date": {
        // Campo opcional: si no parsea, lo dejamos vacío sin marcar la fila.
        const d = coerceDate(value);
        if (d) data.birth_date = d;
        break;
      }
      case "datetime": {
        const d = coerceDateTime(value);
        if (d) data.source_created_at = d;
        break;
      }
      case "notes":
        notesParts.push(value);
        break;
      case "text":
      default:
        if (!(data as Record<string, unknown>)[field.key]) {
          (data as Record<string, unknown>)[field.key] = value;
        }
        break;
    }
  }

  if (notesParts.length > 0) data.initial_notes = notesParts.join("\n");
  if (Object.keys(metadata).length > 0) data.metadata = metadata;

  // Validación: al menos teléfono o email.
  if (!data.phone && !data.email) {
    errors.push("Falta teléfono o email");
  }
  if (data.email && !EMAIL_RE.test(data.email)) {
    errors.push(`Email inválido: ${data.email}`);
  }

  const dupKey =
    data.external_id?.toLowerCase() ||
    data.phone ||
    data.email ||
    null;

  const status: MappedRowStatus =
    errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";

  return { index, data, status, errors, warnings, dupKey };
}

export function applyMapping(
  rawRows: Record<string, string>[],
  mapping: LeadMapping,
): ApplyResult {
  const seen = new Set<string>();
  const rows = rawRows.map((raw, i) => {
    const row = applyRow(raw, mapping, i);
    // Dedup en archivo: si ya vimos la clave, marcamos duplicado (salvo que ya
    // sea error, que tiene prioridad).
    if (row.status !== "error" && row.dupKey) {
      if (seen.has(row.dupKey)) {
        row.status = "duplicate";
      } else {
        seen.add(row.dupKey);
      }
    }
    return row;
  });

  const stats = {
    total: rows.length,
    ok: rows.filter((r) => r.status === "ok").length,
    warning: rows.filter((r) => r.status === "warning").length,
    error: rows.filter((r) => r.status === "error").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
  };

  return { rows, stats };
}

// Contexto por archivo elegido en las pre-preguntas del importador.
export type ImportContext = {
  branch_id?: string;
  product_type_id?: string;
  campaign_id?: string;
  source?: string;
  distribution: "round_robin" | "fixed" | "unassigned";
  assignee_id?: string;
};

export const MAPPED_STATUS_META: Record<
  MappedRowStatus,
  { label: string; tone: "success" | "warning" | "danger" | "muted" }
> = {
  ok: { label: "OK", tone: "success" },
  warning: { label: "Con avisos", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  duplicate: { label: "Duplicado", tone: "muted" },
};

// Helpers compartidos para tareas/visitas (etiquetas, formato de fechas).

import type { Database } from "@/types/database";

export type TaskType = Database["public"]["Enums"]["task_type"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type VisitStatus = Database["public"]["Enums"]["visit_status"];
export type NoteActivity = Database["public"]["Enums"]["note_activity"];

export const NOTE_ACTIVITIES: readonly NoteActivity[] = [
  "phone_call",
  "whatsapp",
  "email_sent",
  "meeting_held",
  "quote_sent",
  "other",
] as const;

export const NOTE_ACTIVITY_LABEL: Record<NoteActivity, string> = {
  phone_call: "Llamada",
  whatsapp: "WhatsApp",
  email_sent: "Email enviado",
  meeting_held: "Reunión realizada",
  quote_sent: "Presupuesto enviado",
  other: "Otra actividad",
};

export const NOTE_ACTIVITY_CLS: Record<NoteActivity, string> = {
  phone_call: "bg-blue-100 text-blue-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email_sent: "bg-purple-100 text-purple-700",
  meeting_held: "bg-amber-100 text-amber-800",
  quote_sent: "bg-accent/15 text-accent",
  other: "bg-muted text-muted-foreground",
};

export const TASK_TYPES: readonly TaskType[] = [
  "call",
  "meeting",
  "quote_send",
  "follow_up",
  "document",
  "other",
] as const;

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  call: "Llamar al cliente",
  meeting: "Coordinar reunión",
  quote_send: "Enviar presupuesto",
  follow_up: "Seguimiento",
  document: "Documentación",
  other: "Otro",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: "Agendada",
  completed: "Realizada",
  no_show: "No vino",
  canceled: "Cancelada",
};

export const VISIT_STATUS_CLS: Record<VisitStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-success/10 text-success",
  no_show: "bg-warning/10 text-warning-foreground",
  canceled: "bg-muted text-muted-foreground",
};

/**
 * Formatea una fecha (column DATE — string "YYYY-MM-DD") como "DD/MM/YYYY"
 * SIN pasar por Date (que rompería el día por timezone).
 */
export function formatDateAR(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/**
 * Formatea una hora de la columna TIME ("HH:MM" o "HH:MM:SS") como "HH:MM".
 * No pasa por Date para no arrastrar timezone.
 */
export function formatTimeAR(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  if (!h || !m) return "";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/**
 * Formatea un timestamptz como "DD/MM/YYYY HH:MM" en zona AR.
 */
export function formatDateTimeAR(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "—";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Devuelve "today", "tomorrow", "soon" (≤7d) o "overdue" para etiquetar.
 * isoDate = "YYYY-MM-DD" (campo date sin tz).
 */
export function dueBucket(
  isoDate: string | null,
):
  | { kind: "none" }
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "soon"; days: number }
  | { kind: "later"; days: number } {
  if (!isoDate) return { kind: "none" };
  // Parsear como local (no UTC) para que "hoy" matchee de verdad.
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return { kind: "none" };
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return { kind: "overdue", days: Math.abs(diffDays) };
  if (diffDays === 0) return { kind: "today" };
  if (diffDays === 1) return { kind: "tomorrow" };
  if (diffDays <= 7) return { kind: "soon", days: diffDays };
  return { kind: "later", days: diffDays };
}

/**
 * Convierte un value de un <input type="datetime-local"> ("YYYY-MM-DDTHH:MM")
 * a un ISO con zona AR explícita para evitar interpretaciones ambiguas.
 */
export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  // value es "2026-06-15T14:30" sin zona — JS lo interpreta como LOCAL.
  // Esto es correcto: el usuario eligió esa hora en su zona, y queremos
  // que se guarde como ese instante. new Date(localStr).toISOString() devuelve UTC.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Convierte un ISO timestamptz al value para un <input type="datetime-local">.
 */
export function isoToLocalDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:MM en hora local.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

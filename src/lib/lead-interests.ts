import type { Database } from "@/types/database";

// ============================================================================
// Intereses personales del lead: metadata compartida entre la ficha, el inbox,
// la próxima acción y los reportes.
//
// El objetivo no es guardar el dato, es que el sistema lo devuelva en el momento
// justo. Guardar sin devolver es un cementerio de datos.
// ============================================================================

export type InterestKind = Database["public"]["Enums"]["interest_kind"];
export type LeadInterest =
  Database["public"]["Tables"]["lead_interests"]["Row"];

export const INTEREST_META: Record<
  InterestKind,
  { label: string; emoji: string; placeholder: string; hint?: string }
> = {
  cuadro: {
    label: "Cuadro",
    emoji: "⚽",
    placeholder: "Boca, River, Racing…",
  },
  cumpleanos: {
    label: "Cumpleaños",
    emoji: "🎂",
    placeholder: "Día y mes",
    hint: "Sin año: sólo lo necesario para saludarlo",
  },
  familia: {
    label: "Familia",
    emoji: "👨‍👧",
    placeholder: "Sofía (hija)",
  },
  hobby: {
    label: "Hobby",
    emoji: "🎣",
    placeholder: "Pesca, golf, moto…",
  },
  mascota: {
    label: "Mascota",
    emoji: "🐶",
    placeholder: "Nombre y tipo",
  },
  profesion: {
    label: "Profesión",
    emoji: "💼",
    placeholder: "Arquitecto, comerciante…",
  },
  vehiculo_actual: {
    label: "Maneja hoy",
    emoji: "🚗",
    placeholder: "Corolla 2018",
  },
  no_molestar: {
    label: "No molestar",
    emoji: "🔇",
    placeholder: "No llamar antes de las 10",
    hint: "Tan valioso como saber de qué cuadro es",
  },
  otro: {
    label: "Otro",
    emoji: "📌",
    placeholder: "Lo que quieras recordar",
  },
};

/** Orden en el que se ofrecen y se muestran los chips. */
export const INTEREST_ORDER: InterestKind[] = [
  "cuadro",
  "cumpleanos",
  "familia",
  "hobby",
  "vehiculo_actual",
  "profesion",
  "mascota",
  "no_molestar",
  "otro",
];

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Etiqueta visible del chip. El cumpleaños se muestra como "14 mar". */
export function interestLabel(i: {
  kind: InterestKind;
  value: string;
  day: number | null;
  month: number | null;
}): string {
  if (i.kind === "cumpleanos" && i.day && i.month) {
    return `${i.day} ${MONTHS[i.month - 1]}`;
  }
  return i.value;
}

/**
 * Días que faltan para el próximo cumpleaños (0 = hoy). null si no es un
 * cumpleaños o le faltan datos.
 *
 * `today` es inyectable para poder testear sin congelar el reloj.
 */
export function daysUntilBirthday(
  i: { kind: InterestKind; day: number | null; month: number | null },
  today: Date = new Date(),
): number | null {
  if (i.kind !== "cumpleanos" || !i.day || !i.month) return null;
  const y = today.getFullYear();
  // Se compara a medianoche para que "hoy" sea 0 y no -1 por las horas.
  const ref = new Date(y, today.getMonth(), today.getDate());
  let next = new Date(y, i.month - 1, i.day);
  if (next < ref) next = new Date(y + 1, i.month - 1, i.day);
  return Math.round((next.getTime() - ref.getTime()) / 86_400_000);
}

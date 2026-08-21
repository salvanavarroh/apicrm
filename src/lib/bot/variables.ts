// ============================================================================
// Variables de las respuestas del bot.
//
// El problema que resuelve: configurando el bot había que escribir el nombre de
// la concesionaria, el horario y la dirección en CADA una de las ocho respuestas.
// Y no hacía falta — todos esos datos ya están cargados en la empresa y en la
// sucursal. Repetirlos a mano es trabajo de más y, peor, una fuente de datos
// desactualizados: se cambia el horario en Empresa y las respuestas del bot
// siguen diciendo el viejo.
//
// Acá vive la lista de variables, de dónde sale cada una y cómo se reemplazan.
// Un solo lugar: si mañana se agrega {whatsapp}, se agrega una línea y aparece
// disponible en todas las respuestas y en la vista previa.
// ============================================================================

export type BotVarKey =
  | "nombre"
  | "concesionaria"
  | "sucursal"
  | "direccion"
  | "telefono"
  | "horario";

export type BotVarMeta = {
  key: BotVarKey;
  /** Qué es, en una línea, para la pantalla de configuración. */
  label: string;
  /** De dónde sale el dato, para que el admin sepa dónde corregirlo. */
  source: string;
  /** Dónde se corrige, si está vacío. */
  fixHref?: string;
};

export const BOT_VARS: BotVarMeta[] = [
  {
    key: "nombre",
    label: "Nombre del cliente",
    source: "El nombre con el que entró la conversación (WhatsApp o Instagram)",
  },
  {
    key: "concesionaria",
    label: "Cómo se presenta el bot",
    source: "El nombre del bot si lo cargaste, o el nombre de la concesionaria",
  },
  {
    key: "sucursal",
    label: "Nombre de la sucursal",
    source: "La sucursal de la conversación",
    fixHref: "/admin/branches",
  },
  {
    key: "direccion",
    label: "Dirección de la sucursal",
    source: "Dirección cargada en la sucursal",
    fixHref: "/admin/branches",
  },
  {
    key: "telefono",
    label: "Teléfono",
    source: "Teléfono de la sucursal, o el de la concesionaria si no tiene",
    fixHref: "/admin/branches",
  },
  {
    key: "horario",
    label: "Horario de atención",
    source: "Horario del inbox configurado en la concesionaria",
    fixHref: "/admin/company",
  },
];

export type BotVarValues = Record<BotVarKey, string>;

/**
 * Reemplaza las variables de una respuesta.
 *
 * Una variable sin valor se reemplaza por vacío y deja la frase con un hueco
 * ("Estamos en ."), que es fea pero honesta: es la señal de que falta cargar el
 * dato. Antes se dejaba el `{direccion}` crudo, que es peor — el cliente recibía
 * una llave.
 */
export function fillVars(reply: string, values: Partial<BotVarValues>): string {
  let out = reply;
  for (const v of BOT_VARS) {
    out = out.replaceAll(`{${v.key}}`, values[v.key] ?? "");
  }
  // Limpieza de los huecos más comunes que deja una variable vacía.
  return out
    .replace(/ {2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Variables que usa una respuesta. Para la vista previa y los avisos. */
export function varsUsedIn(reply: string): BotVarKey[] {
  return BOT_VARS.filter((v) => reply.includes(`{${v.key}}`)).map((v) => v.key);
}

/** "09:00:00" → 9. Las columnas de horario son `time`, no enteros. */
export function hourOf(t: string | null, fallback: number): number {
  if (!t) return fallback;
  const h = Number(t.slice(0, 2));
  return Number.isFinite(h) ? h : fallback;
}

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Horario en palabras, a partir de la config del inbox de la empresa.
 *
 * Sale de la misma configuración que usa el bot para decidir si está "fuera de
 * horario", así que no pueden contradecirse.
 */
export function describeHours(company: {
  inbox_hours_enabled: boolean | null;
  inbox_hours_start: string | null;
  inbox_hours_end: string | null;
  inbox_hours_days: number[] | null;
}): string {
  if (!company.inbox_hours_enabled) return "de lunes a viernes";
  const from = hourOf(company.inbox_hours_start, 9);
  const to = hourOf(company.inbox_hours_end, 18);
  const days = company.inbox_hours_days ?? [1, 2, 3, 4, 5];
  const sorted = [...days].sort((a, b) => a - b);

  // Rango contiguo ("lunes a viernes") vs lista ("lunes, miércoles y viernes").
  const contiguous =
    sorted.length > 1 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const dayText =
    sorted.length === 0
      ? "de lunes a viernes"
      : sorted.length === 1
        ? DAYS[sorted[0]]
        : contiguous
          ? `de ${DAYS[sorted[0]]} a ${DAYS[sorted[sorted.length - 1]]}`
          : sorted.map((d) => DAYS[d]).join(", ");

  return `${dayText} de ${from}:00 a ${to}:00`;
}

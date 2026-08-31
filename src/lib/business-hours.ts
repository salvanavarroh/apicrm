// ============================================================================
// Horas hábiles entre dos instantes.
//
// El "Primer contacto" del informe ejecutivo contaba horas de reloj. Reportado
// por el cliente: un lead que entra un domingo no puede empezar a contar el
// domingo, porque no se trabaja, y distorsiona el promedio de todos.
//
// Se reusa el "horario de atención" que ya se configura en Mi empresa (el mismo
// que usa el reparto del call center): una sola fuente de verdad para "cuándo se
// trabaja". Si la concesionaria no lo configuró, se usa un default razonable en
// vez de volver a contar noches y domingos.
// ============================================================================

export type BusinessHours = {
  /** 1 = lunes … 7 = domingo (ISO). */
  days: number[];
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  tz: string;
};

/** Lunes a sábado de 9 a 18. Lo que hace una concesionaria si nadie dijo otra cosa. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5, 6],
  start: "09:00",
  end: "18:00",
  tz: "America/Argentina/Buenos_Aires",
};

/**
 * Arma el horario a partir de lo guardado en `companies`. Si está apagado o
 * incompleto, cae al default: es mejor una aproximación honesta que seguir
 * contando la madrugada del domingo.
 */
export function businessHoursOf(company: {
  inbox_hours_enabled?: boolean | null;
  inbox_hours_days?: number[] | null;
  inbox_hours_start?: string | null;
  inbox_hours_end?: string | null;
  inbox_tz?: string | null;
}): BusinessHours {
  const tz = company.inbox_tz || DEFAULT_BUSINESS_HOURS.tz;
  const days = company.inbox_hours_days;
  const start = company.inbox_hours_start?.slice(0, 5);
  const end = company.inbox_hours_end?.slice(0, 5);
  if (!company.inbox_hours_enabled || !days?.length || !start || !end) {
    return { ...DEFAULT_BUSINESS_HOURS, tz };
  }
  return { days, start, end, tz };
}

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function localParts(ms: number, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour === "24" ? "0" : p.hour),
    mm: Number(p.minute),
  };
}

/**
 * Instante UTC de una fecha/hora local en `tz`. Corrección de offset en un paso:
 * exacta en zonas sin horario de verano, que es el caso de Argentina.
 */
function zonedToMs(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  tz: string,
): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const back = localParts(guess, tz);
  const asUtc = Date.UTC(back.y, back.m - 1, back.d, back.hh, back.mm);
  return guess + (guess - asUtc);
}

const DAY_MS = 86_400_000;

/** ISO weekday (1 = lunes … 7 = domingo) de una fecha local. */
function isoWeekday(y: number, m: number, d: number): number {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return wd === 0 ? 7 : wd;
}

/**
 * Horas hábiles entre dos instantes. Cuenta sólo lo que cae dentro de la ventana
 * de atención: un lead asignado el domingo a las 20 y contactado el lunes a las
 * 10 da 1 hora, no 14.
 *
 * Se recorre día por día en la zona de la concesionaria (no en pasos chicos):
 * para un mes son 30 vueltas.
 */
export function businessHoursBetween(
  fromIso: string,
  toIso: string,
  bh: BusinessHours,
): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;

  const [sh, sm] = bh.start.split(":").map(Number);
  const [eh, em] = bh.end.split(":").map(Number);
  const days = new Set(bh.days);

  let total = 0;
  // Se arranca en el día local del `from` y se avanza de a un día. El tope de
  // vueltas es una red de seguridad, no una regla de negocio.
  const first = localParts(from, bh.tz);
  let cursor = Date.UTC(first.y, first.m - 1, first.d);
  for (let i = 0; i < 400; i++) {
    const dayStartMs = zonedToMs(
      new Date(cursor).getUTCFullYear(),
      new Date(cursor).getUTCMonth() + 1,
      new Date(cursor).getUTCDate(),
      0,
      0,
      bh.tz,
    );
    if (dayStartMs > to) break;

    const y = new Date(cursor).getUTCFullYear();
    const m = new Date(cursor).getUTCMonth() + 1;
    const d = new Date(cursor).getUTCDate();

    if (days.has(isoWeekday(y, m, d))) {
      const winStart = zonedToMs(y, m, d, sh, sm, bh.tz);
      const winEnd = zonedToMs(y, m, d, eh, em, bh.tz);
      const overlap =
        Math.min(to, winEnd) - Math.max(from, winStart);
      if (overlap > 0) total += overlap;
    }
    cursor += DAY_MS;
  }
  return total / 3_600_000;
}

/** Etiqueta corta del horario, para explicar de dónde sale el número. */
export function businessHoursLabel(bh: BusinessHours): string {
  const NAMES = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  const sorted = [...bh.days].sort((a, b) => a - b);
  // Rango contiguo → "lun a sáb"; si no, se listan.
  const contiguous =
    sorted.length > 1 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const dias = contiguous
    ? `${NAMES[sorted[0]]} a ${NAMES[sorted[sorted.length - 1]]}`
    : sorted.map((d) => NAMES[d]).join(", ");
  return `${dias} de ${bh.start} a ${bh.end}`;
}

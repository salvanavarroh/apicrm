// ============================================================================
// Fechas y horas del asistente, en la zona de la concesionaria.
//
// POR QUÉ EXISTE ESTO. La primera versión hacía `scheduled_at.slice(0, 16)` —
// cortar el ISO de un `timestamptz`, que viene en UTC. Una visita de las 10:00
// en Buenos Aires se le contaba al vendedor como las 13:00. Y "hoy" salía de
// `new Date()` en el servidor, que en Vercel corre en UTC: entre las 21:00 y la
// medianoche de Argentina, "las tareas de hoy" eran las de mañana.
//
// Nada de esto lo puede arreglar el modelo: si le llega mal el dato, lo repite
// bien redactado. La zona sale de `companies.inbox_tz`, que es la misma que usa
// el inbox para su horario de atención.
// ============================================================================

/** Zona por defecto: la del piloto, y la que trae `companies.inbox_tz`. */
export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

function parts(date: Date, tz: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DD" del día de hoy en esa zona. */
export function todayIn(tz: string = DEFAULT_TZ, now = new Date()): string {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY-MM-DD" corrido N días desde hoy, en esa zona. */
export function addDaysIn(
  days: number,
  tz: string = DEFAULT_TZ,
  now = new Date(),
): string {
  return todayIn(tz, new Date(now.getTime() + days * 86_400_000));
}

/** Primer día del mes en curso en esa zona, como timestamp ISO para filtrar. */
export function monthStartIn(tz: string = DEFAULT_TZ, now = new Date()): string {
  const p = parts(now, tz);
  // Se arma el instante UTC equivalente al 1° a las 00:00 locales. El offset se
  // deduce comparando el mismo instante leído en la zona y en UTC.
  const localMidnight = Date.UTC(Number(p.year), Number(p.month) - 1, 1, 0, 0, 0);
  return new Date(localMidnight - offsetMs(now, tz)).toISOString();
}

/** Diferencia entre la zona y UTC, en milisegundos, para ese instante. */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  // Se descartan los segundos de los dos lados para que la resta sea exacta.
  const real = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - real;
}

/** Un `timestamptz` como "HH:MM" en la zona de la concesionaria. */
export function timeIn(iso: string, tz: string = DEFAULT_TZ): string {
  const p = parts(new Date(iso), tz);
  return `${p.hour}:${p.minute}`;
}

/** Un `timestamptz` como "DD/MM HH:MM" en la zona de la concesionaria. */
export function dateTimeIn(iso: string, tz: string = DEFAULT_TZ): string {
  const p = parts(new Date(iso), tz);
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Un `timestamptz` como "DD/MM/YYYY" en la zona de la concesionaria. */
export function dateIn(iso: string, tz: string = DEFAULT_TZ): string {
  const p = parts(new Date(iso), tz);
  return `${p.day}/${p.month}/${p.year}`;
}

/**
 * "jueves 3 de septiembre de 2026". Va en la cápsula de contexto.
 *
 * El modelo NO tiene reloj: sin esto no puede resolver "mañana", "esta semana"
 * ni "el mes que viene", y lo que hace en su lugar es inventar una fecha.
 */
export function describeToday(tz: string = DEFAULT_TZ, now = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

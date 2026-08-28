// ============================================================================
// Next Best Action — qué le conviene hacer al vendedor con este lead, ahora.
//
// Es una función pura: recibe el estado del lead (con sus tareas, visitas y
// presupuestos) y devuelve UNA sugerencia. Sin IA y sin llamadas a la DB, por
// tres razones:
//   - No alucina. La regla que la disparó siempre se puede explicar.
//   - Es instantánea y gratis: corre en el render del detalle del lead.
//   - Es auditable: si el gerente dice "esto está mal", se cambia una regla.
//
// El orden de las reglas ES la prioridad. La primera que matchea gana.
// ============================================================================

import type { LeadStatus, LeadTemperature } from "@/lib/leads";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Umbral de "primer contacto tardío" desde el alta del lead. */
const FIRST_CONTACT_HOURS = 4;
/** Días sin actividad tras un contacto antes de insistir. */
const FOLLOW_UP_DAYS = 3;
/** Días desde el envío del presupuesto antes de pedir respuesta. */
const QUOTE_FOLLOW_UP_DAYS = 2;
/** Días tras los que un "no interesado" se puede reactivar. */
const REACTIVATION_DAYS = 60;
/** Ventana para avisar del cumpleaños. */
const BIRTHDAY_WINDOW_DAYS = 7;

export type NbaUrgency = "now" | "today" | "soon" | "none";

/** Tipo de acción sugerida: sirve para elegir ícono y color en la tarjeta. */
export type NbaKind =
  | "call"
  | "follow_up"
  | "quote"
  | "visit"
  | "task"
  | "sale"
  | "qualify"
  | "greet"
  | "close"
  | "wait";

export type NextBestAction = {
  kind: NbaKind;
  urgency: NbaUrgency;
  /** Qué hacer, en imperativo y corto. */
  title: string;
  /** Por qué se sugiere (el dato que disparó la regla). */
  reason: string;
};

export type NbaLead = {
  status: LeadStatus;
  temperature: LeadTemperature | null;
  created_at: string;
  status_changed_at: string;
  last_contacted_at: string | null;
  last_managed_at: string;
  assigned_user_id: string | null;
};

export type NbaTask = {
  title?: string | null;
  due_date: string | null;
  completed_at: string | null;
};

export type NbaVisit = {
  scheduled_at: string;
  status: string;
};

export type NbaQuote = {
  created_at: string;
  sent_at: string | null;
};

/** Sólo lo que la regla de cumpleaños necesita. */
export type NbaBirthday = { day: number | null; month: number | null };

export type NbaInput = {
  lead: NbaLead;
  /** Cumpleaños cargados como interés del lead. */
  birthdays?: NbaBirthday[];
  tasks?: NbaTask[];
  visits?: NbaVisit[];
  quotes?: NbaQuote[];
  /** Venta abierta del lead, si hay (status 'evaluating'). */
  activeSaleStatus?: string | null;
};

function hoursSince(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / HOUR_MS;
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

/**
 * Días hasta el próximo cumpleaños (0 = hoy). Copia local para que este módulo
 * siga siendo una función pura sin importar nada de UI.
 */
function daysUntilBirthday(
  b: NbaBirthday,
  nowMs: number,
): number | null {
  if (!b.day || !b.month) return null;
  const today = new Date(nowMs);
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), b.month - 1, b.day);
  if (next < ref) next = new Date(today.getFullYear() + 1, b.month - 1, b.day);
  return Math.round((next.getTime() - ref.getTime()) / DAY_MS);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Devuelve la próxima mejor acción, o null si el lead está en un estado que no
 * requiere nada del vendedor (venta cerrada, por ejemplo).
 *
 * `now` es inyectable para poder testear la función sin congelar el reloj.
 */
export function nextBestAction(
  input: NbaInput,
  now: number = Date.now(),
): NextBestAction | null {
  const {
    lead,
    tasks = [],
    visits = [],
    quotes = [],
    birthdays = [],
    activeSaleStatus,
  } = input;

  // --- Estados terminales -------------------------------------------------
  if (lead.status === "accepted" || lead.status === "closed") {
    return null;
  }

  if (lead.status === "rejected") {
    return {
      kind: "close",
      urgency: "soon",
      title: "Ofrecele una alternativa",
      reason:
        "La venta fue rechazada. Antes de darlo por perdido, probá con otra unidad o modalidad de pago.",
    };
  }

  if (lead.status === "not_interested") {
    const days = daysSince(lead.status_changed_at, now);
    if (days >= REACTIVATION_DAYS) {
      return {
        kind: "follow_up",
        urgency: "soon",
        title: "Probá reactivarlo",
        reason: `Se marcó como no interesado hace ${days} días. Un contacto con una oferta nueva no molesta y a veces vuelve.`,
      };
    }
    return {
      kind: "wait",
      urgency: "none",
      title: "Nada por ahora",
      reason: `Marcado como no interesado hace ${days} ${plural(days, "día", "días")}. Se puede reactivar a los ${REACTIVATION_DAYS}.`,
    };
  }

  // --- 1. Venta en curso: es lo más valioso que tiene el vendedor ---------
  if (activeSaleStatus === "evaluating") {
    return {
      kind: "sale",
      urgency: "today",
      title: "Seguí la aprobación de la venta",
      reason:
        "Hay una venta en evaluación. Chequeá que la documentación esté completa para que no se frene del lado administrativo.",
    };
  }

  // --- 1.b Cumpleaños ----------------------------------------------------
  // Va antes de las tareas porque caduca: un saludo tarde no sirve. Y es la
  // excusa más barata que existe para reactivar un lead frío.
  const nextBirthday = birthdays
    .map((b) => daysUntilBirthday(b, now))
    .filter((d): d is number => d !== null && d <= BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a - b)[0];
  if (nextBirthday !== undefined) {
    return {
      kind: "greet",
      urgency: nextBirthday === 0 ? "now" : "today",
      title:
        nextBirthday === 0
          ? "Saludalo: hoy es su cumpleaños"
          : `Preparale el saludo: cumple en ${nextBirthday} ${plural(nextBirthday, "día", "días")}`,
      reason:
        "Es el contacto más fácil de justificar y el que mejor reactiva un lead frío. No hables de plata: sólo saludá.",
    };
  }

  // --- 2. Tarea vencida ---------------------------------------------------
  const overdue = tasks
    .filter((t) => !t.completed_at && t.due_date)
    .filter((t) => new Date(t.due_date!).getTime() < now)
    .sort(
      (a, b) =>
        new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime(),
    );
  if (overdue.length > 0) {
    const t = overdue[0];
    const days = daysSince(t.due_date!, now);
    return {
      kind: "task",
      urgency: "now",
      title: t.title
        ? `Resolvé la tarea vencida: ${t.title}`
        : "Resolvé la tarea vencida",
      reason:
        days <= 0
          ? "Vencía hoy."
          : `Venció hace ${days} ${plural(days, "día", "días")}${
              overdue.length > 1 ? ` (y hay ${overdue.length - 1} más)` : ""
            }.`,
    };
  }

  // --- 3. Visita agendada -------------------------------------------------
  const upcoming = visits
    .filter((v) => v.status === "scheduled")
    .filter((v) => new Date(v.scheduled_at).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  if (upcoming.length > 0) {
    const v = upcoming[0];
    const hours = -hoursSince(v.scheduled_at, now);
    if (hours <= 48) {
      return {
        kind: "visit",
        urgency: hours <= 24 ? "now" : "today",
        title: "Confirmá la visita",
        reason: `Tiene visita agendada para ${new Date(
          v.scheduled_at,
        ).toLocaleString("es-AR", {
          weekday: "long",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}. Un recordatorio el día antes baja las ausencias.`,
      };
    }
  }

  // Visita pasada sin cerrar: hay que registrar qué pasó.
  const pastScheduled = visits.filter(
    (v) => v.status === "scheduled" && new Date(v.scheduled_at).getTime() < now,
  );
  if (pastScheduled.length > 0) {
    return {
      kind: "visit",
      urgency: "now",
      title: "Registrá el resultado de la visita",
      reason:
        "Quedó una visita agendada en el pasado sin marcar como realizada, no vino o cancelada.",
    };
  }

  // --- 4. Lead nuevo sin contactar ---------------------------------------
  if (lead.status === "new") {
    if (!lead.assigned_user_id) {
      return {
        kind: "task",
        urgency: "now",
        title: "Asignale un vendedor",
        reason:
          "El lead no tiene dueño. Sin responsable, nadie lo va a llamar.",
      };
    }
    const hours = Math.round(hoursSince(lead.created_at, now));
    return {
      kind: "call",
      urgency: hours >= FIRST_CONTACT_HOURS ? "now" : "today",
      title: "Hacé el primer contacto",
      reason:
        hours >= FIRST_CONTACT_HOURS
          ? `Entró hace ${hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} días`} y todavía no se registró contacto. La conversión cae fuerte después de las primeras horas.`
          : `Entró hace ${hours} h. Llamalo ahora que la consulta está fresca.`,
    };
  }

  // --- 5. Interesado sin presupuesto -------------------------------------
  if (lead.status === "interested" && quotes.length === 0) {
    return {
      kind: "quote",
      urgency: "today",
      title: "Generale el presupuesto",
      reason:
        "Está marcado como interesado y no tiene ningún presupuesto. Mandalo sin esperar a que lo pida.",
    };
  }

  // --- 6. Presupuesto enviado sin respuesta ------------------------------
  if (lead.status === "quoted" && quotes.length > 0) {
    const lastSent = quotes
      .map((q) => q.sent_at ?? q.created_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const days = daysSince(lastSent, now);
    if (days >= QUOTE_FOLLOW_UP_DAYS) {
      return {
        kind: "follow_up",
        urgency: days >= 5 ? "now" : "today",
        title: "Pedile una respuesta al presupuesto",
        reason: `El último presupuesto salió hace ${days} ${plural(days, "día", "días")} y no hubo definición. Preguntá directo si sigue en carrera.`,
      };
    }
  }

  // --- 7. Contactado pero frenado ---------------------------------------
  // `last_managed_at` y no `status_changed_at`: si el vendedor completó una
  // tarea y agendó la siguiente, el lead está gestionado aunque no haya
  // cambiado de estado. Antes la ficha seguía gritando "volvé a contactarlo".
  const lastTouch = lead.last_contacted_at ?? lead.last_managed_at;
  const daysQuiet = daysSince(lastTouch, now);
  if (daysQuiet >= FOLLOW_UP_DAYS) {
    const hot = lead.temperature === "hot";
    return {
      kind: "follow_up",
      urgency: hot || daysQuiet >= 7 ? "now" : "today",
      title: "Volvé a contactarlo",
      reason: `${
        hot ? "Es un lead caliente y hace" : "Hace"
      } ${daysQuiet} ${plural(daysQuiet, "día", "días")} que no se registra contacto.`,
    };
  }

  // --- 8. Sin calificar --------------------------------------------------
  if (!lead.temperature) {
    return {
      kind: "qualify",
      urgency: "soon",
      title: "Calificá la temperatura",
      reason:
        "Sin temperatura este lead no entra en ninguna priorización: ni en la tuya ni en los reportes del gerente.",
    };
  }

  // --- 9. Sin próximo paso agendado --------------------------------------
  const hasFuture =
    tasks.some(
      (t) =>
        !t.completed_at && t.due_date && new Date(t.due_date).getTime() >= now,
    ) || upcoming.length > 0;
  if (!hasFuture) {
    return {
      kind: "task",
      urgency: "soon",
      title: "Agendá el próximo paso",
      reason:
        "No tiene ninguna tarea ni visita futura. Un lead sin próximo paso agendado es un lead que se olvida.",
    };
  }

  return {
    kind: "wait",
    urgency: "none",
    title: "Al día",
    reason:
      "Contacto reciente y próximo paso agendado. No hace falta hacer nada hoy.",
  };
}

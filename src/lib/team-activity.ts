// ============================================================================
// Informe de actividad del equipo: tiempo dentro del CRM + qué hicieron.
//
// Dos mitades que se leen juntas y por separado no dicen nada:
//
//   TIEMPO   sale de `user_activity_buckets` (ver su migración: qué cuenta como
//            tiempo y por qué). Contesta "cuánto estuvo".
//   TRABAJO  sale de las tablas que ya existían —notas tipadas, mensajes del
//            inbox, tareas, visitas, ventas—. Contesta "qué hizo".
//
// El cruce de las dos es el número que gerencia venía pidiendo sin poder
// pedirlo: gestiones por hora conectada. Ocho horas de CRM con tres notas es un
// problema distinto de dos horas con veinte, y hasta ahora los dos se veían
// igual (o no se veían).
//
// El scope lo pone la RLS, como en los reportes del catálogo: se usa el cliente
// del usuario, así el gerente ve su equipo y el admin toda la concesionaria sin
// que este módulo lo sepa. La lista de vendedores sí se filtra explícitamente,
// porque `profiles` es legible por toda la empresa.
// ============================================================================

import { fetchPaged } from "@/lib/leads-fetch";
import { fullName } from "@/lib/leads";
import { SECTION_LABELS, type ActivitySection } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

export type ActivityScope = {
  companyId: string;
  /** Gerente cuyo equipo se mira. Null = toda la concesionaria (admin). */
  managerId: string | null;
};

export type TeamActivityRow = {
  id: string;
  name: string;
  branch: string | null;
  active: boolean;
  /** Minutos dentro del CRM en el período. */
  minutes: number;
  /** Días con al menos un minuto de actividad. */
  activeDays: number;
  avgMinutesPerDay: number;
  /** Hora promedio del primer latido del día (minutos desde medianoche). */
  startAvgMinutes: number | null;
  lastSeenAt: string | null;
  leadsReceived: number;
  leadsManaged: number;
  contacts: number;
  messages: number;
  tasksDone: number;
  tasksOverdue: number;
  visitsDone: number;
  visitsPending: number;
  sales: number;
  /** Gestiones (contactos + mensajes + tareas + visitas) por hora conectada. */
  actionsPerHour: number | null;
};

export type Point = { label: string; value: number };

export type TeamActivity = {
  tz: string;
  from: string;
  to: string;
  rows: TeamActivityRow[];
  /** Horas del equipo por día del período. */
  byDay: Point[];
  /** Minutos del equipo por sección del CRM. */
  bySection: Point[];
  totals: {
    minutes: number;
    people: number;
    peopleWithTime: number;
    contacts: number;
    messages: number;
    tasksDone: number;
    tasksOverdue: number;
    visitsDone: number;
    sales: number;
    avgMinutesPerPersonDay: number;
    actionsPerHour: number | null;
  };
  capped: boolean;
};

export type SellerActivityDay = {
  day: string;
  minutes: number;
  firstAt: string | null;
  lastAt: string | null;
  contacts: number;
  tasksDone: number;
  visits: number;
};

export type SellerActivity = {
  row: TeamActivityRow;
  tz: string;
  from: string;
  to: string;
  days: SellerActivityDay[];
  bySection: Point[];
  /** Minutos por hora del día (0..23), para ver el turno real. */
  byHour: number[];
};

// ---------------------------------------------------------------------------
// Fechas en el timezone de la concesionaria.
//
// El "día" del informe es el de la concesionaria, no el del servidor (que corre
// en UTC): un vendedor que contesta a las 21:30 en Buenos Aires cae al día
// siguiente en UTC, y el reporte le movía la jornada. La base agrupa con
// `at time zone`, así que los límites que le mandamos tienen que ser los mismos
// instantes.
// ---------------------------------------------------------------------------

function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60_000;
}

/** Instante UTC de `ymd` + `msIntoDay` leído en el timezone `tz`. */
function zonedInstant(ymd: string, msIntoDay: number, tz: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`).getTime() + msIntoDay;
  const offset = tzOffsetMinutes(new Date(guess), tz);
  return new Date(guess - offset * 60_000);
}

function rangeBounds(from: string, to: string, tz: string) {
  return {
    fromIso: zonedInstant(from, 0, tz).toISOString(),
    toIso: zonedInstant(to, 24 * 3_600_000 - 1, tz).toISOString(),
  };
}

/** "YYYY-MM-DD" de un instante, en el timezone de la concesionaria. */
function zonedDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Días del período, en orden, como claves "YYYY-MM-DD". */
function dayKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (
    let t = new Date(`${from}T00:00:00Z`).getTime();
    t <= end;
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 400) break; // guarda contra un rango absurdo por URL
  }
  return out;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

type TotalsRow = {
  user_id: string;
  minutes: number;
  active_days: number;
  start_avg_minutes: number | null;
  last_at: string | null;
};
type DayRow = { day: string; minutes: number };
type SectionRow = { section: string; minutes: number };
type UserDayRow = {
  day: string;
  minutes: number;
  first_at: string;
  last_at: string;
};
type HourRow = { hour_of_day: number; minutes: number };

/** Vendedores en scope + el timezone de la concesionaria.
 *  `onlyUserId` es para la pantalla de detalle: mismo scope, una sola persona. */
async function loadPeople(scope: ActivityScope, onlyUserId?: string) {
  const supabase = await createClient();
  const [{ data: company }, { data: people }] = await Promise.all([
    supabase.from("companies").select("inbox_tz").eq("id", scope.companyId).maybeSingle(),
    (() => {
      let q = supabase
        .from("profiles")
        .select("id, first_name, last_name, status, branches(name)")
        .eq("company_id", scope.companyId)
        .eq("role", "sales")
        .neq("status", "deleted");
      if (scope.managerId) q = q.eq("manager_id", scope.managerId);
      if (onlyUserId) q = q.eq("id", onlyUserId);
      return q.order("first_name");
    })(),
  ]);
  return {
    tz: company?.inbox_tz || DEFAULT_TZ,
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: fullName(p.first_name, p.last_name),
      branch: (p.branches as { name: string } | null)?.name ?? null,
      active: p.status === "active",
    })),
  };
}

/**
 * Lo que hicieron: una consulta por entidad, agregada acá por autor.
 *
 * Con `onlyUserId` el filtro por autor baja a la base. La pantalla de detalle
 * pasa por acá para una sola persona, y sin esto barría las notas y los
 * mensajes de toda la concesionaria para tirar el 95%.
 */
async function loadWork(
  companyId: string,
  fromIso: string,
  toIso: string,
  todayKey: string,
  onlyUserId?: string,
) {
  const supabase = await createClient();
  const only = <T extends { eq: (c: string, v: string) => T }>(
    q: T,
    column: string,
  ): T => (onlyUserId ? q.eq(column, onlyUserId) : q);

  const [notes, messages, tasksDone, tasksOverdue, visits, sales, leads] =
    await Promise.all([
    fetchPaged<{ author_id: string | null; lead_id: string; activity_type: string | null }>(
      (withCount) =>
        only(
          supabase
            .from("lead_notes")
            .select("author_id, lead_id, activity_type", withCount ? { count: "exact" } : {})
            .eq("company_id", companyId),
          "author_id",
        )
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: false }),
    ),
    fetchPaged<{ sent_by_user_id: string | null }>((withCount) =>
      only(
        supabase
          .from("messages")
          .select("sent_by_user_id", withCount ? { count: "exact" } : {})
          .eq("company_id", companyId)
          .eq("direction", "outbound")
          .not("sent_by_user_id", "is", null),
        "sent_by_user_id",
      )
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false }),
    ),
    // Tareas completadas EN el período.
    fetchPaged<{ assigned_to: string | null }>((withCount) =>
      only(
        supabase
          .from("lead_tasks")
          .select("assigned_to", withCount ? { count: "exact" } : {})
          .eq("company_id", companyId)
          .not("completed_at", "is", null),
        "assigned_to",
      )
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso)
        .order("completed_at", { ascending: false }),
    ),
    // Vencidas: sin completar y con fecha ya pasada. NO se acotan al período —
    // una tarea vencida hace dos meses sigue siendo el pendiente de hoy, y
    // esconderla sería justamente perder el dato que gerencia va a buscar.
    fetchPaged<{ assigned_to: string | null }>((withCount) =>
      only(
        supabase
          .from("lead_tasks")
          .select("assigned_to", withCount ? { count: "exact" } : {})
          .eq("company_id", companyId)
          .is("completed_at", null)
          .not("due_date", "is", null),
        "assigned_to",
      )
        .lte("due_date", todayKey)
        .order("due_date", { ascending: false }),
    ),
    fetchPaged<{ assigned_to: string | null; status: string }>((withCount) =>
      only(
        supabase
          .from("visits")
          .select("assigned_to, status", withCount ? { count: "exact" } : {})
          .eq("company_id", companyId),
        "assigned_to",
      )
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso)
        .order("scheduled_at", { ascending: false }),
    ),
    only(
      supabase
        .from("sales")
        .select("vendor_id, status")
        .eq("company_id", companyId),
      "vendor_id",
    )
      .gte("started_at", fromIso)
      .lte("started_at", toIso),
    fetchPaged<{ assigned_user_id: string | null }>((withCount) =>
      only(
        supabase
          .from("leads")
          .select("assigned_user_id", withCount ? { count: "exact" } : {})
          .eq("company_id", companyId)
          .not("assigned_user_id", "is", null),
        "assigned_user_id",
      )
        .gte("assigned_at", fromIso)
        .lte("assigned_at", toIso)
        .order("assigned_at", { ascending: false }),
    ),
  ]);

  const contacts = new Map<string, number>();
  const managed = new Map<string, Set<string>>();
  for (const n of notes.rows) {
    if (!n.author_id || !n.activity_type) continue;
    contacts.set(n.author_id, (contacts.get(n.author_id) ?? 0) + 1);
    const set = managed.get(n.author_id) ?? new Set<string>();
    set.add(n.lead_id);
    managed.set(n.author_id, set);
  }

  const sent = new Map<string, number>();
  for (const m of messages.rows) {
    if (!m.sent_by_user_id) continue;
    sent.set(m.sent_by_user_id, (sent.get(m.sent_by_user_id) ?? 0) + 1);
  }

  const countByUser = (rows: { assigned_to: string | null }[]) => {
    const agg = new Map<string, number>();
    for (const r of rows) {
      if (!r.assigned_to) continue;
      agg.set(r.assigned_to, (agg.get(r.assigned_to) ?? 0) + 1);
    }
    return agg;
  };
  const doneByUser = countByUser(tasksDone.rows);
  const overdueByUser = countByUser(tasksOverdue.rows);

  const visitsDone = new Map<string, number>();
  const visitsPending = new Map<string, number>();
  for (const v of visits.rows) {
    if (!v.assigned_to) continue;
    if (v.status === "completed") {
      visitsDone.set(v.assigned_to, (visitsDone.get(v.assigned_to) ?? 0) + 1);
    } else if (v.status === "scheduled") {
      visitsPending.set(v.assigned_to, (visitsPending.get(v.assigned_to) ?? 0) + 1);
    }
  }

  const closed = new Map<string, number>();
  for (const s of sales.data ?? []) {
    if (!s.vendor_id || s.status !== "accepted") continue;
    closed.set(s.vendor_id, (closed.get(s.vendor_id) ?? 0) + 1);
  }

  const received = new Map<string, number>();
  for (const l of leads.rows) {
    if (!l.assigned_user_id) continue;
    received.set(l.assigned_user_id, (received.get(l.assigned_user_id) ?? 0) + 1);
  }

  return {
    contacts,
    managed,
    sent,
    tasksDone: doneByUser,
    tasksOverdue: overdueByUser,
    visitsDone,
    visitsPending,
    closed,
    received,
    capped:
      notes.capped ||
      messages.capped ||
      tasksDone.capped ||
      tasksOverdue.capped ||
      visits.capped ||
      leads.capped,
  };
}

/** Las secciones ya vienen agregadas de la base; acá sólo se traducen a
 *  etiqueta y se ordenan de mayor a menor. */
function sectionPoints(rows: SectionRow[]): Point[] {
  const agg = new Map<string, number>();
  for (const r of rows) {
    const label =
      SECTION_LABELS[r.section as ActivitySection] ?? SECTION_LABELS.other;
    agg.set(label, (agg.get(label) ?? 0) + r.minutes);
  }
  return [...agg.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Informe del equipo completo (o de una sola persona, para el detalle). */
export async function loadTeamActivity(
  scope: ActivityScope,
  range: { from: string; to: string },
  onlyUserId?: string,
): Promise<TeamActivity> {
  const { tz, people } = await loadPeople(scope, onlyUserId);
  const { fromIso, toIso } = rangeBounds(range.from, range.to, tz);
  const supabase = await createClient();
  const todayKey = zonedDay(new Date().toISOString(), tz);

  // `p_user_ids` recorta al equipo que se está mirando: la RLS le dejaría ver
  // también sus propios buckets y los de otros perfiles de la empresa, y esos
  // no son parte del total del equipo de vendedores.
  const userIds = people.map((p) => p.id);
  const [{ data: totalRows }, { data: dayRows }, { data: sectionRows }, work] =
    await Promise.all([
      supabase.rpc("activity_user_totals", {
        p_from: fromIso,
        p_to: toIso,
        p_tz: tz,
        p_user_ids: userIds,
      }),
      supabase.rpc("activity_by_day", {
        p_from: fromIso,
        p_to: toIso,
        p_tz: tz,
        p_user_ids: userIds,
      }),
      supabase.rpc("activity_by_section", {
        p_from: fromIso,
        p_to: toIso,
        p_user_ids: userIds,
      }),
      loadWork(scope.companyId, fromIso, toIso, todayKey, onlyUserId),
    ]);

  const totals = new Map(
    ((totalRows ?? []) as TotalsRow[]).map((t) => [t.user_id, t]),
  );

  const rows: TeamActivityRow[] = people.map((p) => {
    const t = totals.get(p.id);
    const minutes = t?.minutes ?? 0;
    const activeDays = t?.active_days ?? 0;
    const actions =
      (work.contacts.get(p.id) ?? 0) +
      (work.sent.get(p.id) ?? 0) +
      (work.tasksDone.get(p.id) ?? 0) +
      (work.visitsDone.get(p.id) ?? 0);
    return {
      id: p.id,
      name: p.name,
      branch: p.branch,
      active: p.active,
      minutes,
      activeDays,
      avgMinutesPerDay: activeDays ? Math.round(minutes / activeDays) : 0,
      startAvgMinutes: t?.start_avg_minutes ?? null,
      lastSeenAt: t?.last_at ?? null,
      leadsReceived: work.received.get(p.id) ?? 0,
      leadsManaged: work.managed.get(p.id)?.size ?? 0,
      contacts: work.contacts.get(p.id) ?? 0,
      messages: work.sent.get(p.id) ?? 0,
      tasksDone: work.tasksDone.get(p.id) ?? 0,
      tasksOverdue: work.tasksOverdue.get(p.id) ?? 0,
      visitsDone: work.visitsDone.get(p.id) ?? 0,
      visitsPending: work.visitsPending.get(p.id) ?? 0,
      sales: work.closed.get(p.id) ?? 0,
      actionsPerHour: minutes >= 30 ? round1(actions / (minutes / 60)) : null,
    };
  });

  const byDayAgg = new Map<string, number>();
  for (const key of dayKeys(range.from, range.to)) byDayAgg.set(key, 0);
  for (const d of (dayRows ?? []) as DayRow[]) {
    byDayAgg.set(d.day, (byDayAgg.get(d.day) ?? 0) + d.minutes);
  }

  const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
  const personDays = rows.reduce((a, r) => a + r.activeDays, 0);
  const totalActions = rows.reduce(
    (a, r) => a + r.contacts + r.messages + r.tasksDone + r.visitsDone,
    0,
  );

  return {
    tz,
    from: range.from,
    to: range.to,
    rows,
    byDay: [...byDayAgg.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, minutes]) => ({
        label: day.slice(5).split("-").reverse().join("/"),
        value: round1(minutes / 60),
      })),
    bySection: sectionPoints((sectionRows ?? []) as SectionRow[]),
    totals: {
      minutes: totalMinutes,
      people: rows.length,
      peopleWithTime: rows.filter((r) => r.minutes > 0).length,
      contacts: rows.reduce((a, r) => a + r.contacts, 0),
      messages: rows.reduce((a, r) => a + r.messages, 0),
      tasksDone: rows.reduce((a, r) => a + r.tasksDone, 0),
      tasksOverdue: rows.reduce((a, r) => a + r.tasksOverdue, 0),
      visitsDone: rows.reduce((a, r) => a + r.visitsDone, 0),
      sales: rows.reduce((a, r) => a + r.sales, 0),
      avgMinutesPerPersonDay: personDays ? Math.round(totalMinutes / personDays) : 0,
      actionsPerHour:
        totalMinutes >= 60 ? round1(totalActions / (totalMinutes / 60)) : null,
    },
    capped: work.capped,
  };
}

/** Detalle de un vendedor: día por día, secciones y turno real. */
export async function loadSellerActivity(
  scope: ActivityScope,
  userId: string,
  range: { from: string; to: string },
): Promise<SellerActivity | null> {
  // Mismo cálculo que la tabla del equipo, acotado a una persona: así los
  // números del detalle y los de la fila no pueden divergir nunca.
  const team = await loadTeamActivity(scope, range, userId);
  const row = team.rows.find((r) => r.id === userId);
  if (!row) return null;

  const tz = team.tz;
  const { fromIso, toIso } = rangeBounds(range.from, range.to, tz);
  const supabase = await createClient();

  const [{ data: dayRows }, { data: sectionRows }, { data: hourRows }, notes, tasks, visits] =
    await Promise.all([
      supabase.rpc("activity_user_days", {
        p_user_id: userId,
        p_from: fromIso,
        p_to: toIso,
        p_tz: tz,
      }),
      supabase.rpc("activity_by_section", {
        p_from: fromIso,
        p_to: toIso,
        p_user_ids: [userId],
      }),
      supabase.rpc("activity_user_hours", {
        p_user_id: userId,
        p_from: fromIso,
        p_to: toIso,
        p_tz: tz,
      }),
      supabase
        .from("lead_notes")
        .select("created_at")
        .eq("company_id", scope.companyId)
        .eq("author_id", userId)
        .not("activity_type", "is", null)
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("lead_tasks")
        .select("completed_at")
        .eq("company_id", scope.companyId)
        .eq("assigned_to", userId)
        .not("completed_at", "is", null)
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso),
      supabase
        .from("visits")
        .select("scheduled_at")
        .eq("company_id", scope.companyId)
        .eq("assigned_to", userId)
        .eq("status", "completed")
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso),
    ]);

  const byKey = new Map(
    ((dayRows ?? []) as UserDayRow[]).map((d) => [d.day, d]),
  );

  const countByDay = (rows: { at: string | null }[]) => {
    const agg = new Map<string, number>();
    for (const r of rows) {
      if (!r.at) continue;
      const key = zonedDay(r.at, tz);
      agg.set(key, (agg.get(key) ?? 0) + 1);
    }
    return agg;
  };
  const contactsByDay = countByDay((notes.data ?? []).map((n) => ({ at: n.created_at })));
  const tasksByDay = countByDay((tasks.data ?? []).map((t) => ({ at: t.completed_at })));
  const visitsByDay = countByDay((visits.data ?? []).map((v) => ({ at: v.scheduled_at })));

  const allDays: SellerActivityDay[] = dayKeys(range.from, range.to).map((key) => {
    const d = byKey.get(key);
    return {
      day: key,
      minutes: d?.minutes ?? 0,
      firstAt: d?.first_at ?? null,
      lastAt: d?.last_at ?? null,
      contacts: contactsByDay.get(key) ?? 0,
      tasksDone: tasksByDay.get(key) ?? 0,
      visits: visitsByDay.get(key) ?? 0,
    };
  });

  // Se recortan los días vacíos de las DOS puntas (el vendedor entró recién el
  // martes, o el período llega hasta fin de mes y hoy es el 7) pero se conservan
  // los del medio: un hueco en la mitad de la semana ES la información.
  const hasAny = (d: SellerActivityDay) =>
    d.minutes > 0 || d.contacts > 0 || d.tasksDone > 0 || d.visits > 0;
  const firstIdx = allDays.findIndex(hasAny);
  const lastIdx = allDays.findLastIndex(hasAny);
  const days =
    firstIdx === -1 ? [] : allDays.slice(firstIdx, lastIdx + 1).reverse();

  const byHour = Array.from({ length: 24 }, () => 0);
  for (const h of (hourRows ?? []) as HourRow[])
    byHour[h.hour_of_day] += h.minutes;

  return {
    row,
    tz,
    from: range.from,
    to: range.to,
    days,
    bySection: sectionPoints((sectionRows ?? []) as SectionRow[]),
    byHour,
  };
}

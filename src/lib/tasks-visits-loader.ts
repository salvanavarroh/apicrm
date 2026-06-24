// Loader server-side de tareas/visitas para la pantalla /tasks-visits y para
// el widget del dashboard. RLS ya scopea por rol (a través de la visibilidad
// del lead asociado).

import type { AgendaItem } from "@/components/dashboard/agenda-calendar";
import type {
  TaskRow,
  VisitRow,
} from "@/components/tasks-visits/tasks-visits-view";
import { TASK_TYPE_LABEL, formatTimeAR } from "@/lib/tasks";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export type LoadedTasksVisits = {
  tasks: TaskRow[];
  visits: VisitRow[];
};

export async function loadTasksAndVisitsForCompany(
  companyId: string,
  opts?: {
    onlyAssignedTo?: string;
    onlyPending?: boolean;
    limit?: number;
  },
): Promise<LoadedTasksVisits> {
  const supabase = await createClient();

  let tasksQuery = supabase
    .from("lead_tasks")
    .select(
      `id, task_type, title, description, priority, due_date, due_time, completed_at,
       assigned_to, lead_id,
       lead:leads!lead_id (first_name, last_name),
       assignee:profiles!assigned_to (first_name, last_name)`,
    )
    .eq("company_id", companyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false });

  let visitsQuery = supabase
    .from("visits")
    .select(
      `id, scheduled_at, notes, status, assigned_to, lead_id,
       lead:leads!lead_id (first_name, last_name),
       assignee:profiles!assigned_to (first_name, last_name)`,
    )
    .eq("company_id", companyId)
    .order("scheduled_at", { ascending: true });

  if (opts?.onlyAssignedTo) {
    tasksQuery = tasksQuery.eq("assigned_to", opts.onlyAssignedTo);
    visitsQuery = visitsQuery.eq("assigned_to", opts.onlyAssignedTo);
  }
  if (opts?.onlyPending) {
    tasksQuery = tasksQuery.is("completed_at", null);
    visitsQuery = visitsQuery.eq("status", "scheduled");
  }
  if (opts?.limit) {
    tasksQuery = tasksQuery.limit(opts.limit);
    visitsQuery = visitsQuery.limit(opts.limit);
  }

  const [{ data: tasks }, { data: visits }] = await Promise.all([
    tasksQuery,
    visitsQuery,
  ]);

  const taskRows: TaskRow[] = (tasks ?? []).map((t) => ({
    id: t.id,
    lead_id: t.lead_id,
    lead_name: t.lead
      ? fullName(t.lead.first_name, t.lead.last_name) || "(lead sin nombre)"
      : "(lead eliminado)",
    task_type: t.task_type,
    title: t.title,
    description: t.description,
    priority: t.priority,
    due_date: t.due_date,
    due_time: t.due_time,
    completed_at: t.completed_at,
    assignee_name: t.assignee
      ? fullName(t.assignee.first_name, t.assignee.last_name)
      : null,
  }));

  const visitRows: VisitRow[] = (visits ?? []).map((v) => ({
    id: v.id,
    lead_id: v.lead_id,
    lead_name: v.lead
      ? fullName(v.lead.first_name, v.lead.last_name) || "(lead sin nombre)"
      : "(lead eliminado)",
    scheduled_at: v.scheduled_at,
    notes: v.notes,
    status: v.status,
    assignee_name: v.assignee
      ? fullName(v.assignee.first_name, v.assignee.last_name)
      : null,
  }));

  return { tasks: taskRows, visits: visitRows };
}

/**
 * Carga tareas + visitas en formato AgendaItem para el widget del dashboard.
 * - Tareas: con due_date no nula.
 * - Visitas: status scheduled o completed (para mostrar histórico cercano).
 * Filtra por rol via onlyAssignedTo + por compañía (la RLS hace el resto).
 */
export async function loadAgendaForCompany(
  companyId: string,
  opts: { leadBasePath: string; onlyAssignedTo?: string },
): Promise<AgendaItem[]> {
  const { tasks, visits } = await loadTasksAndVisitsForCompany(companyId, {
    onlyAssignedTo: opts.onlyAssignedTo,
  });

  const items: AgendaItem[] = [];

  for (const t of tasks) {
    if (!t.due_date) continue;
    items.push({
      id: t.id,
      kind: "task",
      dateKey: t.due_date.slice(0, 10),
      scheduledAt: null,
      time: formatTimeAR(t.due_time),
      title: TASK_TYPE_LABEL[t.task_type] ?? t.title ?? "Tarea",
      taskType: t.task_type,
      leadId: t.lead_id,
      leadName: t.lead_name,
      href: `${opts.leadBasePath}/${t.lead_id}`,
      done: !!t.completed_at,
    });
  }

  for (const v of visits) {
    const d = new Date(v.scheduled_at);
    if (Number.isNaN(d.getTime())) continue;
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    items.push({
      id: v.id,
      kind: "visit",
      dateKey,
      scheduledAt: v.scheduled_at,
      title: `Visita${v.notes ? `: ${v.notes.slice(0, 60)}${v.notes.length > 60 ? "…" : ""}` : ""}`,
      taskType: null,
      leadId: v.lead_id,
      leadName: v.lead_name,
      href: `${opts.leadBasePath}/${v.lead_id}`,
      done: v.status !== "scheduled",
    });
  }

  return items;
}

/** YYYY-MM-DD del día de hoy en zona AR. Evita mismatch SSR/hidratación. */
export function todayDateKey(): string {
  const now = new Date();
  // Convertir a AR (offset -03) — getDate() ya da local del server pero
  // queremos AR específicamente. Usamos toLocaleDateString.
  const arDate = now.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  // en-CA formato YYYY-MM-DD ya.
  return arDate;
}

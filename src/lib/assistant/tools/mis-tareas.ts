// ============================================================================
// misTareas — qué hay pendiente hoy y en los próximos días.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName } from "@/lib/leads";
import { TASK_PRIORITY_LABEL, TASK_TYPE_LABEL } from "@/lib/tasks";
import {
  addDaysIso,
  todayIso,
  type Tool,
  type ToolResult,
} from "@/lib/assistant/tools/types";

type TaskRow = {
  id: string;
  title: string | null;
  task_type: keyof typeof TASK_TYPE_LABEL;
  priority: keyof typeof TASK_PRIORITY_LABEL;
  due_date: string | null;
  due_time: string | null;
  lead_id: string;
  leads: { first_name: string | null; last_name: string | null } | null;
};

type VisitRow = {
  id: string;
  scheduled_at: string;
  status: string;
  lead_id: string;
  leads: { first_name: string | null; last_name: string | null } | null;
};

const HOME_BY_ROLE: Record<string, string> = {
  admin: "/admin/tasks-visits",
  manager: "/manager/tasks-visits",
  supervisor: "/manager/tasks-visits",
  sales: "/sales/tasks-visits",
};

export const misTareas: Tool = {
  name: "misTareas",
  description: "Tareas pendientes y visitas agendadas en los próximos días.",
  async run(_question: string, ctx: AssistantContext): Promise<ToolResult> {
    const supabase = await createClient();
    const today = todayIso();
    const horizon = addDaysIso(7);

    const [tasks, visits] = await Promise.all([
      supabase
        .from("lead_tasks")
        .select(
          "id, title, task_type, priority, due_date, due_time, lead_id, leads(first_name, last_name)",
        )
        .is("completed_at", null)
        .lte("due_date", horizon)
        .order("due_date", { ascending: true })
        .order("due_time", { ascending: true, nullsFirst: true })
        .limit(15),
      supabase
        .from("visits")
        .select("id, scheduled_at, status, lead_id, leads(first_name, last_name)")
        .eq("status", "scheduled")
        .gte("scheduled_at", `${today}T00:00:00`)
        .lte("scheduled_at", `${horizon}T23:59:59`)
        .order("scheduled_at", { ascending: true })
        .limit(10),
    ]);

    const taskRows = (tasks.data ?? []) as unknown as TaskRow[];
    const visitRows = (visits.data ?? []) as unknown as VisitRow[];

    if (taskRows.length === 0 && visitRows.length === 0) {
      return {
        data: "No hay tareas pendientes ni visitas agendadas para los próximos 7 días.",
        links: [{ href: HOME_BY_ROLE[ctx.role] ?? "/", label: "Tareas y Visitas" }],
      };
    }

    const lines: string[] = [];
    if (taskRows.length > 0) {
      lines.push(`Tareas pendientes (${taskRows.length}, hasta 7 días vista):`);
      for (const t of taskRows) {
        const vencida = t.due_date !== null && t.due_date < today;
        const quien = fullName(t.leads?.first_name ?? null, t.leads?.last_name ?? null);
        lines.push(
          `- ${t.due_date ?? "sin fecha"}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}` +
            `${vencida ? " (VENCIDA)" : ""} · ${TASK_TYPE_LABEL[t.task_type]}` +
            ` · prioridad ${TASK_PRIORITY_LABEL[t.priority]}` +
            ` · ${t.title ?? "sin título"} · lead: ${quien}`,
        );
      }
    }
    if (visitRows.length > 0) {
      lines.push("", `Visitas agendadas (${visitRows.length}):`);
      for (const v of visitRows) {
        const quien = fullName(v.leads?.first_name ?? null, v.leads?.last_name ?? null);
        lines.push(`- ${v.scheduled_at.slice(0, 16).replace("T", " ")} · ${quien}`);
      }
    }

    return {
      data: lines.join("\n"),
      links: [{ href: HOME_BY_ROLE[ctx.role] ?? "/", label: "Tareas y Visitas" }],
      note: `${taskRows.length} tareas, ${visitRows.length} visitas`,
    };
  },
};

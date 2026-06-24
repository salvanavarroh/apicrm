"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { toggleLeadTask } from "@/app/(app)/admin/leads/actions";
import { updateVisitStatus } from "@/app/(app)/admin/leads/visit-actions";

import {
  TASK_PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  VISIT_STATUS_CLS,
  VISIT_STATUS_LABEL,
  dueBucket,
  formatDateAR,
  formatDateTimeAR,
  formatTimeAR,
  type TaskPriority,
  type TaskType,
  type VisitStatus,
} from "@/lib/tasks";

export type TaskRow = {
  id: string;
  lead_id: string;
  lead_name: string;
  task_type: TaskType;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  assignee_name: string | null;
  /** Legacy fallback */
  title?: string | null;
};

export type VisitRow = {
  id: string;
  lead_id: string;
  lead_name: string;
  scheduled_at: string;
  notes: string | null;
  status: VisitStatus;
  assignee_name: string | null;
};

type Props = {
  tasks: TaskRow[];
  visits: VisitRow[];
  /** Base path for leads (e.g. "/admin/leads"). */
  leadBasePath: string;
  /** Default tab in URL — when missing falls back to "tasks". */
  initialTab?: "tasks" | "visits";
};

const PRIORITY_CLS: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-destructive/10 text-destructive",
};

export function TasksVisitsView({
  tasks,
  visits,
  leadBasePath,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<"tasks" | "visits">(initialTab ?? "tasks");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-border">
        <TabButton
          active={tab === "tasks"}
          onClick={() => setTab("tasks")}
          count={tasks.filter((t) => !t.completed_at).length}
        >
          Tareas
        </TabButton>
        <TabButton
          active={tab === "visits"}
          onClick={() => setTab("visits")}
          count={visits.filter((v) => v.status === "scheduled").length}
        >
          Visitas
        </TabButton>
      </div>

      {tab === "tasks" ? (
        <TasksTab tasks={tasks} leadBasePath={leadBasePath} />
      ) : (
        <VisitsTab visits={visits} leadBasePath={leadBasePath} />
      )}
    </div>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "relative inline-flex items-center gap-2 border-b-2 border-accent px-4 py-2 text-sm font-semibold text-foreground"
          : "relative inline-flex items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
      <span
        className={
          active
            ? "rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent"
            : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
        }
      >
        {count}
      </span>
    </button>
  );
}

function TasksTab({
  tasks,
  leadBasePath,
}: {
  tasks: TaskRow[];
  leadBasePath: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "completed" | "all"
  >("pending");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        const done = !!t.completed_at;
        if (statusFilter === "pending" && done) return false;
        if (statusFilter === "completed" && !done) return false;
        if (!q) return true;
        const label = TASK_TYPE_LABEL[t.task_type] ?? t.title ?? "";
        return [t.lead_name, label, t.description, t.assignee_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        // Pendientes primero, después por due_date asc (vencidas arriba).
        const aDone = !!a.completed_at;
        const bDone = !!b.completed_at;
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (a.due_date && b.due_date) {
          const byDate = a.due_date.localeCompare(b.due_date);
          if (byDate !== 0) return byDate;
          // Mismo día: ordenar por horario (sin hora va al final).
          return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99");
        }
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
      });
  }, [tasks, query, statusFilter]);

  function toggle(taskId: string, done: boolean) {
    startTransition(async () => {
      const r = await toggleLeadTask(taskId, done);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-row flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Buscar por lead, tipo o asignado…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as "pending" | "completed" | "all")
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="completed">Realizadas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {tasks.length}
        </span>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Circle className="size-7 text-muted-foreground" />}
          message="No hay tareas con esos filtros."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => {
            const done = !!t.completed_at;
            const bucket = done ? null : dueBucket(t.due_date);
            const label = TASK_TYPE_LABEL[t.task_type] ?? t.title ?? "Tarea";
            return (
              <Card
                key={t.id}
                className="flex flex-row items-start gap-3 p-3.5 transition-colors hover:bg-muted/40"
              >
                <button
                  type="button"
                  onClick={() => toggle(t.id, !done)}
                  className="mt-0.5 text-muted-foreground hover:text-accent"
                  aria-label={done ? "Marcar pendiente" : "Marcar realizada"}
                >
                  {done ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Circle className="size-5" />
                  )}
                </button>
                <Link
                  href={`${leadBasePath}/${t.lead_id}`}
                  className="flex flex-1 flex-col gap-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <p
                        className={
                          done
                            ? "text-sm text-muted-foreground line-through"
                            : "text-sm font-medium text-foreground"
                        }
                      >
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.lead_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLS[t.priority]}`}
                      >
                        {TASK_PRIORITY_LABEL[t.priority]}
                      </span>
                    </div>
                  </div>
                  {t.description && (
                    <p
                      className={
                        done
                          ? "text-xs text-muted-foreground/70 line-through"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {t.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {t.due_date && (
                      <DueLabel
                        bucket={bucket}
                        date={t.due_date}
                        time={t.due_time}
                        done={done}
                      />
                    )}
                    {t.assignee_name && (
                      <>
                        <span className="text-muted-foreground/60">·</span>
                        <span>{t.assignee_name}</span>
                      </>
                    )}
                  </div>
                </Link>
                <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VisitsTab({
  visits,
  leadBasePath,
}: {
  visits: VisitRow[];
  leadBasePath: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "all">(
    "scheduled",
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visits
      .filter((v) => {
        if (statusFilter !== "all" && v.status !== statusFilter) return false;
        if (!q) return true;
        return [v.lead_name, v.notes, v.assignee_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [visits, query, statusFilter]);

  function setStatus(visitId: string, status: VisitStatus) {
    startTransition(async () => {
      const r = await updateVisitStatus(visitId, status);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-row flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Buscar por lead, notas o vendedor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as VisitStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="completed">Realizadas</SelectItem>
            <SelectItem value="no_show">No vinieron</SelectItem>
            <SelectItem value="canceled">Canceladas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {visits.length}
        </span>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-7 text-muted-foreground" />}
          message="No hay visitas con esos filtros."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="flex flex-row items-start gap-3 p-3.5 transition-colors hover:bg-muted/40"
            >
              <span
                aria-hidden
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
              >
                <CalendarDays className="size-4" />
              </span>
              <Link
                href={`${leadBasePath}/${v.lead_id}`}
                className="flex flex-1 flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {formatDateTimeAR(v.scheduled_at)} hs
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.lead_name}
                      {v.assignee_name ? ` · ${v.assignee_name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${VISIT_STATUS_CLS[v.status]}`}
                  >
                    {VISIT_STATUS_LABEL[v.status]}
                  </span>
                </div>
                {v.notes && (
                  <p className="text-xs text-muted-foreground">{v.notes}</p>
                )}
              </Link>
              {v.status === "scheduled" && (
                <button
                  type="button"
                  onClick={() => setStatus(v.id, "completed")}
                  className="rounded-md border border-input bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
                  aria-label="Marcar realizada"
                >
                  <Check className="inline size-3.5" /> Realizada
                </button>
              )}
              <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DueLabel({
  bucket,
  date,
  time,
  done,
}: {
  bucket: ReturnType<typeof dueBucket> | null;
  date: string;
  time?: string | null;
  done: boolean;
}) {
  const hhmm = formatTimeAR(time ?? null);
  const at = hhmm ? ` ${hhmm}` : "";
  if (done)
    return (
      <span>
        Vencía el {formatDateAR(date)}
        {at}
      </span>
    );
  if (!bucket || bucket.kind === "none") return null;
  if (bucket.kind === "overdue") {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
        Vencida {bucket.days}d
      </span>
    );
  }
  if (bucket.kind === "today") {
    return (
      <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-foreground">
        Hoy{at}
      </span>
    );
  }
  if (bucket.kind === "tomorrow") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
        Mañana{at}
      </span>
    );
  }
  return (
    <span>
      Vence el {formatDateAR(date)}
      {at}
    </span>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span aria-hidden>{icon}</span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </Card>
  );
}

export {};

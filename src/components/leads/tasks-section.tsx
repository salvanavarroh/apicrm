"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  TASK_PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  dueBucket,
  formatDateAR,
  formatTimeAR,
  type TaskPriority,
  type TaskType,
} from "@/lib/tasks";

import {
  addLeadTask,
  deleteLeadTask,
  toggleLeadTask,
} from "@/app/(app)/admin/leads/actions";

export type LeadTask = {
  id: string;
  task_type: TaskType;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null; // "YYYY-MM-DD" (date column)
  due_time: string | null; // "HH:MM[:SS]" (time column) — opcional
  completed_at: string | null;
  created_at?: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  /** Legacy fallback: tareas pre-Sprint9 traían title libre. */
  title?: string | null;
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

type AssigneeOption = { id: string; name: string };

type Props = {
  leadId: string;
  tasks: LeadTask[];
  currentUserId: string;
  currentRole: "admin" | "manager" | "sales";
  assigneeOptions: AssigneeOption[];
  readonly?: boolean;
};

const SELF_SENTINEL = "__self__";
const PRIORITY_CLS: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/10 text-info",
  high: "bg-destructive/10 text-destructive",
};

export function TasksSection({
  leadId,
  tasks,
  currentUserId,
  currentRole,
  assigneeOptions,
  readonly,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<LeadTask[]>(tasks);
  const [lastSyncedTasks, setLastSyncedTasks] = useState(tasks);
  const [taskType, setTaskType] = useState<TaskType>("call");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState(""); // "YYYY-MM-DD"
  const [dueTime, setDueTime] = useState(""); // "HH:MM"
  const [assignedTo, setAssignedTo] = useState<string>(SELF_SENTINEL);

  // Re-sync con el server cuando llegan tareas nuevas.
  if (tasks !== lastSyncedTasks) {
    setLastSyncedTasks(tasks);
    setItems(tasks);
  }

  const canAssignOthers = currentRole !== "sales" && assigneeOptions.length > 0;

  function submit() {
    const resolvedAssignee =
      assignedTo === SELF_SENTINEL ? currentUserId : assignedTo;
    const assigneeName =
      assignedTo === SELF_SENTINEL
        ? "Vos"
        : (assigneeOptions.find((o) => o.id === assignedTo)?.name ?? null);

    const tempId = `tmp_${Math.random().toString(36).slice(2)}`;
    const optimistic: LeadTask = {
      id: tempId,
      task_type: taskType,
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
      due_time: dueTime || null,
      completed_at: null,
      created_at: new Date().toISOString(),
      assigned_to: resolvedAssignee,
      assignee_name: assigneeName,
    };
    setItems((prev) => [optimistic, ...prev]);

    const snapshot = {
      taskType,
      description,
      priority,
      dueDate,
      dueTime,
      assignedTo,
    };
    setDescription("");
    setDueDate("");
    setDueTime("");
    setPriority("medium");

    startTransition(async () => {
      const result = await addLeadTask(leadId, {
        task_type: snapshot.taskType,
        description: snapshot.description,
        priority: snapshot.priority,
        due_date: snapshot.dueDate,
        due_time: snapshot.dueTime,
        assigned_to:
          snapshot.assignedTo === SELF_SENTINEL ? "" : snapshot.assignedTo,
      });
      if (!result.ok) {
        toast.error(result.message);
        setItems((prev) => prev.filter((t) => t.id !== tempId));
        setDescription(snapshot.description);
        setDueDate(snapshot.dueDate);
        setDueTime(snapshot.dueTime);
        setPriority(snapshot.priority);
        setTaskType(snapshot.taskType);
        setAssignedTo(snapshot.assignedTo);
        return;
      }
      setItems((prev) =>
        prev.map((t) => (t.id === tempId ? { ...t, id: result.taskId } : t)),
      );
      router.refresh();
    });
  }

  function toggle(taskId: string, done: boolean) {
    setItems((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, completed_at: done ? new Date().toISOString() : null }
          : t,
      ),
    );
    startTransition(async () => {
      const result = await toggleLeadTask(taskId, done);
      if (!result.ok) {
        toast.error(result.message);
        setItems((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, completed_at: done ? null : new Date().toISOString() }
              : t,
          ),
        );
      }
    });
  }

  function remove(taskId: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((t) => t.id !== taskId));
    startTransition(async () => {
      const result = await deleteLeadTask(taskId);
      if (!result.ok) {
        toast.error(result.message);
        setItems(snapshot);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tareas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!readonly && (
          <div className="grid gap-3 rounded-md border bg-card p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Tipo de tarea</Label>
                <Select
                  value={taskType}
                  onValueChange={(v) => setTaskType(v as TaskType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TASK_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px]">Vencimiento</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px]">Horario</Label>
                  <Input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    disabled={!dueDate}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Descripción (opcional)</Label>
              <Textarea
                rows={2}
                placeholder="Detalles, contexto, link al lead origen…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Prioridad</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as TaskPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {canAssignOthers ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px]">Asignar a</Label>
                  <Select
                    value={assignedTo}
                    onValueChange={(v) => setAssignedTo(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELF_SENTINEL}>Para mí</SelectItem>
                      {assigneeOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px]">Asignada a</Label>
                  <div className="flex h-9 items-center border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    Para mí
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={pending}>
                Agregar tarea
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {items.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin tareas
            </p>
          )}
          {items.map((task) => {
            const done = !!task.completed_at;
            const label =
              TASK_TYPE_LABEL[task.task_type] ?? task.title ?? "Tarea";
            const bucket = done ? null : dueBucket(task.due_date);
            return (
              <div
                key={task.id}
                className="flex items-start gap-2 rounded-md border bg-card px-3 py-2"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={(v) => toggle(task.id, Boolean(v))}
                  className="mt-0.5"
                  disabled={readonly}
                />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={
                        done
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm font-medium text-foreground"
                      }
                    >
                      {label}
                    </p>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLS[task.priority]}`}
                    >
                      {TASK_PRIORITY_LABEL[task.priority]}
                    </span>
                  </div>
                  {task.description && (
                    <p
                      className={
                        done
                          ? "text-xs text-muted-foreground/70 line-through"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {task.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {task.due_date && (
                      <DueBadge
                        bucket={bucket}
                        date={task.due_date}
                        time={task.due_time}
                      />
                    )}
                    {task.assignee_name && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-muted-foreground/60">·</span>
                        <span>
                          {task.assigned_to === currentUserId
                            ? "Para mí"
                            : task.assignee_name}
                        </span>
                      </span>
                    )}
                    {task.created_at && (
                      <span className="text-muted-foreground/70">
                        · Creada {fmtTs(task.created_at)}
                      </span>
                    )}
                    {done && task.completed_at && (
                      <span className="text-success">
                        · Finalizada {fmtTs(task.completed_at)}
                      </span>
                    )}
                  </div>
                </div>
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => remove(task.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DueBadge({
  bucket,
  date,
  time,
}: {
  bucket: ReturnType<typeof dueBucket> | null;
  date: string;
  time?: string | null;
}) {
  const hhmm = formatTimeAR(time ?? null);
  const at = hhmm ? ` ${hhmm}` : "";
  if (!bucket || bucket.kind === "none") {
    return (
      <span>
        Vence el {formatDateAR(date)}
        {at}
      </span>
    );
  }
  if (bucket.kind === "overdue") {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
        Vencida ({bucket.days}d)
      </span>
    );
  }
  if (bucket.kind === "today") {
    return (
      <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-text">
        Hoy{at}
      </span>
    );
  }
  if (bucket.kind === "tomorrow") {
    return (
      <span className="rounded-full bg-info/10 px-2 py-0.5 font-medium text-info">
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

"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addLeadNote,
  addLeadTask,
  deleteLeadTask,
  toggleLeadTask,
} from "@/app/(app)/admin/leads/actions";
import {
  deleteVisit,
  scheduleVisit,
  updateVisitStatus,
} from "@/app/(app)/admin/leads/visit-actions";
import { DatePicker, DateTimePicker, TimePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  NOTE_ACTIVITIES,
  NOTE_ACTIVITY_CLS,
  NOTE_ACTIVITY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  VISIT_STATUS_CLS,
  VISIT_STATUS_LABEL,
  dueBucket,
  formatDateAR,
  formatDateTimeAR,
  formatTimeAR,
  isoToLocalDateTime,
  localDateTimeToIso,
  type NoteActivity,
  type TaskPriority,
  type TaskType,
  type VisitStatus,
} from "@/lib/tasks";

import type { LeadNote } from "./notes-section";
import type { LeadTask } from "./tasks-section";
import type { LeadVisit } from "./visits-section";

type AssigneeOption = { id: string; name: string };

type Props = {
  leadId: string;
  notes: LeadNote[];
  tasks: LeadTask[];
  visits: LeadVisit[];
  currentUserId: string;
  currentRole: "admin" | "manager" | "sales";
  assigneeOptions: AssigneeOption[];
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  readonly?: boolean;
};

type Mode = "note" | "task" | "visit";
const NONE = "__none__";
const SELF = "__self__";
const INHERIT = "__inherit__";

const PRIORITY_CLS: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/10 text-info",
  high: "bg-destructive/10 text-destructive",
};
const VISIT_STATUS_OPTIONS: VisitStatus[] = [
  "scheduled",
  "completed",
  "no_show",
  "canceled",
];

function fullName(a: string | null, b: string | null) {
  return [a, b].filter(Boolean).join(" ") || "—";
}
function tmp() {
  return `tmp_${Math.random().toString(36).slice(2)}`;
}
function dayTs(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

export function ActivitySection({
  leadId,
  notes,
  tasks,
  visits,
  currentUserId,
  currentRole,
  assigneeOptions,
  defaultAssigneeId,
  defaultAssigneeName,
  readonly,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Estado optimista de las tres colecciones, re-sincronizado con el server.
  const [noteItems, setNoteItems] = useState(notes);
  const [taskItems, setTaskItems] = useState(tasks);
  const [visitItems, setVisitItems] = useState(visits);
  const [synced, setSynced] = useState({ notes, tasks, visits });
  if (synced.notes !== notes || synced.tasks !== tasks || synced.visits !== visits) {
    setSynced({ notes, tasks, visits });
    setNoteItems(notes);
    setTaskItems(tasks);
    setVisitItems(visits);
  }

  const [mode, setMode] = useState<Mode>("note");
  const canAssignOthers = currentRole !== "sales" && assigneeOptions.length > 0;

  // -------- Composer: Actividad / Nota --------
  const [activity, setActivity] = useState<string>(NONE);
  const [content, setContent] = useState("");

  function submitNote() {
    if (!content.trim()) return;
    const act = activity === NONE ? null : (activity as NoteActivity);
    const id = tmp();
    setNoteItems((p) => [
      { id, content: content.trim(), created_at: new Date().toISOString(), activity_type: act, author: null },
      ...p,
    ]);
    const snap = { content, activity };
    setContent("");
    setActivity(NONE);
    startTransition(async () => {
      const r = await addLeadNote(leadId, snap.content, act);
      if (!r.ok) {
        toast.error(r.message);
        setNoteItems((p) => p.filter((n) => n.id !== id));
        setContent(snap.content);
        setActivity(snap.activity);
        return;
      }
      router.refresh();
    });
  }

  // -------- Composer: Tarea --------
  const [taskType, setTaskType] = useState<TaskType>("call");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [taskAssignee, setTaskAssignee] = useState(SELF);

  function submitTask() {
    const resolved = taskAssignee === SELF ? currentUserId : taskAssignee;
    const name =
      taskAssignee === SELF
        ? "Vos"
        : assigneeOptions.find((o) => o.id === taskAssignee)?.name ?? null;
    const id = tmp();
    setTaskItems((p) => [
      {
        id,
        task_type: taskType,
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        due_time: dueTime || null,
        completed_at: null,
        created_at: new Date().toISOString(),
        assigned_to: resolved,
        assignee_name: name,
      },
      ...p,
    ]);
    const snap = { taskType, description, priority, dueDate, dueTime, taskAssignee };
    setDescription("");
    setDueDate("");
    setDueTime("");
    setPriority("medium");
    startTransition(async () => {
      const r = await addLeadTask(leadId, {
        task_type: snap.taskType,
        description: snap.description,
        priority: snap.priority,
        due_date: snap.dueDate,
        due_time: snap.dueTime,
        assigned_to: snap.taskAssignee === SELF ? "" : snap.taskAssignee,
      });
      if (!r.ok) {
        toast.error(r.message);
        setTaskItems((p) => p.filter((t) => t.id !== id));
        return;
      }
      setTaskItems((p) => p.map((t) => (t.id === id ? { ...t, id: r.taskId } : t)));
      router.refresh();
    });
  }

  function toggleTask(taskId: string, done: boolean) {
    setTaskItems((p) =>
      p.map((t) =>
        t.id === taskId ? { ...t, completed_at: done ? new Date().toISOString() : null } : t,
      ),
    );
    startTransition(async () => {
      const r = await toggleLeadTask(taskId, done);
      if (!r.ok) {
        toast.error(r.message);
        setTaskItems((p) =>
          p.map((t) =>
            t.id === taskId ? { ...t, completed_at: done ? null : new Date().toISOString() } : t,
          ),
        );
      } else {
        router.refresh();
      }
    });
  }

  function removeTask(taskId: string) {
    const snap = taskItems;
    setTaskItems((p) => p.filter((t) => t.id !== taskId));
    startTransition(async () => {
      const r = await deleteLeadTask(taskId);
      if (!r.ok) {
        toast.error(r.message);
        setTaskItems(snap);
      }
    });
  }

  // -------- Composer: Visita --------
  // Vacío en el render inicial para no romper hidratación (Date difiere en
  // server vs client); se sugiere al abrir la pestaña Visita.
  const [visitAt, setVisitAt] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [visitAssignee, setVisitAssignee] = useState(INHERIT);

  function openVisitTab() {
    setMode("visit");
    if (!visitAt) setVisitAt(isoToLocalDateTime(defaultNext24h()));
  }

  function submitVisit() {
    const iso = localDateTimeToIso(visitAt);
    if (!iso) {
      toast.error("Elegí una fecha y hora válidas");
      return;
    }
    const resolved = visitAssignee === INHERIT ? defaultAssigneeId : visitAssignee;
    const name =
      visitAssignee === INHERIT
        ? defaultAssigneeName
        : assigneeOptions.find((o) => o.id === visitAssignee)?.name ?? null;
    const id = tmp();
    setVisitItems((p) => [
      { id, scheduled_at: iso, notes: visitNotes.trim() || null, status: "scheduled", assigned_to: resolved, assignee_name: name },
      ...p,
    ]);
    const snap = { visitNotes };
    setVisitNotes("");
    startTransition(async () => {
      const r = await scheduleVisit(leadId, {
        scheduled_at: iso,
        notes: snap.visitNotes,
        assigned_to: visitAssignee === INHERIT ? "" : visitAssignee,
      });
      if (!r.ok) {
        toast.error(r.message);
        setVisitItems((p) => p.filter((v) => v.id !== id));
        return;
      }
      toast.success("Visita agendada");
      router.refresh();
    });
  }

  function setVisitStatusLocal(visitId: string, status: VisitStatus) {
    const snap = visitItems;
    setVisitItems((p) => p.map((v) => (v.id === visitId ? { ...v, status } : v)));
    startTransition(async () => {
      const r = await updateVisitStatus(visitId, status);
      if (!r.ok) {
        toast.error(r.message);
        setVisitItems(snap);
      } else {
        router.refresh();
      }
    });
  }

  function removeVisit(visitId: string) {
    if (!confirm("¿Eliminar esta visita?")) return;
    const snap = visitItems;
    setVisitItems((p) => p.filter((v) => v.id !== visitId));
    startTransition(async () => {
      const r = await deleteVisit(visitId);
      if (!r.ok) {
        toast.error(r.message);
        setVisitItems(snap);
      }
    });
  }

  // -------- Derivados: Pendiente + Historial --------
  const openTasks = taskItems.filter((t) => !t.completed_at);
  const scheduledVisits = visitItems.filter((v) => v.status === "scheduled");
  const pending = [
    ...openTasks.map((t) => ({ kind: "task" as const, id: t.id, ts: dueMs(t.due_date, t.due_time), task: t })),
    ...scheduledVisits.map((v) => ({ kind: "visit" as const, id: v.id, ts: new Date(v.scheduled_at).getTime(), visit: v })),
  ].sort((a, b) => a.ts - b.ts);

  const history = [
    ...noteItems.map((n) => ({ kind: "note" as const, id: n.id, ts: new Date(n.created_at).getTime(), note: n })),
    ...taskItems
      .filter((t) => t.completed_at)
      .map((t) => ({ kind: "taskDone" as const, id: t.id, ts: new Date(t.completed_at!).getTime(), task: t })),
    ...visitItems
      .filter((v) => v.status !== "scheduled")
      .map((v) => ({ kind: "visitPast" as const, id: v.id, ts: new Date(v.scheduled_at).getTime(), visit: v })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Composer */}
        {!readonly && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
            <div className="flex gap-1 self-start rounded-md border bg-card p-0.5 text-xs">
              <ModeTab active={mode === "note"} onClick={() => setMode("note")} icon={<MessageSquare className="size-3.5" />} label="Actividad" />
              <ModeTab active={mode === "task"} onClick={() => setMode("task")} icon={<ClipboardList className="size-3.5" />} label="Tarea" />
              <ModeTab active={mode === "visit"} onClick={openVisitTab} icon={<CalendarClock className="size-3.5" />} label="Visita" />
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "note" &&
                "Dejá una nota o registrá algo que ya pasó (llamada, WhatsApp, reunión…)."}
              {mode === "task" &&
                "Agendá algo para hacer más adelante, con vencimiento y responsable."}
              {mode === "visit" &&
                "Agendá la visita del cliente a la concesionaria."}
            </p>

            {mode === "note" && (
              <div className="flex flex-col gap-2">
                <Select value={activity} onValueChange={setActivity}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Tipo de actividad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Solo nota</SelectItem>
                    {NOTE_ACTIVITIES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {NOTE_ACTIVITY_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  rows={2}
                  placeholder={activity === NONE ? "Escribí una nota interna…" : "Contanos qué pasó / qué dijo el cliente…"}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitNote} disabled={!content.trim()}>
                    {activity === NONE ? "Agregar nota" : "Registrar actividad"}
                  </Button>
                </div>
              </div>
            )}

            {mode === "task" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Tipo de tarea">
                    <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{TASK_TYPE_LABEL[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Vencimiento">
                      <DatePicker value={dueDate} onChange={setDueDate} />
                    </Field>
                    <Field label="Horario">
                      <TimePicker value={dueTime} onChange={setDueTime} disabled={!dueDate} />
                    </Field>
                  </div>
                </div>
                <Field label="Descripción (opcional)">
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Prioridad">
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {canAssignOthers && (
                    <Field label="Asignar a">
                      <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELF}>Para mí</SelectItem>
                          {assigneeOptions.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitTask}>Agregar tarea</Button>
                </div>
              </div>
            )}

            {mode === "visit" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Fecha y hora">
                    <DateTimePicker value={visitAt} onChange={setVisitAt} />
                  </Field>
                  {canAssignOthers && (
                    <Field label="Atiende">
                      <Select value={visitAssignee} onValueChange={setVisitAssignee}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Vendedor del lead{defaultAssigneeName ? ` (${defaultAssigneeName})` : ""}
                          </SelectItem>
                          {assigneeOptions.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>
                <Field label="Notas (opcional)">
                  <Textarea rows={2} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
                </Field>
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitVisit} disabled={!visitAt}>Agendar visita</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pendiente */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendiente
          </p>
          {pending.length === 0 ? (
            <p className="py-1 text-center text-xs text-muted-foreground">
              Sin acciones pendientes
            </p>
          ) : (
            pending.map((it) =>
              it.kind === "task" ? (
                <PendingTask
                  key={it.id}
                  task={it.task}
                  currentUserId={currentUserId}
                  readonly={readonly}
                  onToggle={toggleTask}
                  onRemove={removeTask}
                />
              ) : (
                <PendingVisit
                  key={it.id}
                  visit={it.visit}
                  currentUserId={currentUserId}
                  readonly={readonly}
                  onStatus={setVisitStatusLocal}
                  onRemove={removeVisit}
                />
              ),
            )
          )}
        </div>

        {/* Historial */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial
          </p>
          {history.length === 0 ? (
            <p className="py-1 text-center text-xs text-muted-foreground">
              Todavía no hay actividad
            </p>
          ) : (
            history.map((it) => {
              if (it.kind === "note") return <NoteRow key={it.id} note={it.note} />;
              if (it.kind === "taskDone")
                return (
                  <HistoryLine
                    key={it.id}
                    icon={<CheckCircle2 className="size-4 text-success" />}
                    title={TASK_TYPE_LABEL[it.task.task_type] ?? it.task.title ?? "Tarea"}
                    meta={`Tarea completada · ${dayTs(it.task.completed_at)}${it.task.assignee_name ? ` · ${it.task.assigned_to === currentUserId ? "Vos" : it.task.assignee_name}` : ""}`}
                    body={it.task.description}
                  />
                );
              return (
                <HistoryLine
                  key={it.id}
                  icon={<CalendarClock className="size-4 text-muted-foreground" />}
                  title={`Visita · ${formatDateTimeAR(it.visit.scheduled_at)} hs`}
                  meta={VISIT_STATUS_LABEL[it.visit.status]}
                  metaCls={VISIT_STATUS_CLS[it.visit.status]}
                  body={it.visit.notes}
                />
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ------- subcomponentes -------

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1",
        active ? "bg-accent/15 font-medium text-accent" : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}

function PendingTask({
  task,
  currentUserId,
  readonly,
  onToggle,
  onRemove,
}: {
  task: LeadTask;
  currentUserId: string;
  readonly?: boolean;
  onToggle: (id: string, done: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const bucket = dueBucket(task.due_date);
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card px-3 py-2">
      <Checkbox
        checked={false}
        onCheckedChange={(v) => onToggle(task.id, Boolean(v))}
        className="mt-0.5"
        disabled={readonly}
      />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{TASK_TYPE_LABEL[task.task_type] ?? task.title ?? "Tarea"}</p>
          <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", PRIORITY_CLS[task.priority])}>
            {TASK_PRIORITY_LABEL[task.priority]}
          </span>
        </div>
        {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {task.due_date && <DueBadge bucket={bucket} date={task.due_date} time={task.due_time} />}
          {task.assignee_name && (
            <span>· {task.assigned_to === currentUserId ? "Para mí" : task.assignee_name}</span>
          )}
        </div>
      </div>
      {!readonly && (
        <button type="button" onClick={() => onRemove(task.id)} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function PendingVisit({
  visit,
  currentUserId,
  readonly,
  onStatus,
  onRemove,
}: {
  visit: LeadVisit;
  currentUserId: string;
  readonly?: boolean;
  onStatus: (id: string, s: VisitStatus) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock className="size-3.5 text-muted-foreground" />
            {formatDateTimeAR(visit.scheduled_at)} hs
          </span>
          {visit.assignee_name && (
            <span className="text-[11px] text-muted-foreground">
              Atiende: {visit.assigned_to === currentUserId ? "Vos" : visit.assignee_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {readonly ? (
            <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", VISIT_STATUS_CLS[visit.status])}>
              {VISIT_STATUS_LABEL[visit.status]}
            </span>
          ) : (
            <Select value={visit.status} onValueChange={(v) => onStatus(visit.id, v as VisitStatus)}>
              <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{VISIT_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!readonly && (
            <button type="button" onClick={() => onRemove(visit.id)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar visita">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {visit.notes && <p className="text-xs text-muted-foreground">{visit.notes}</p>}
    </div>
  );
}

function NoteRow({ note }: { note: LeadNote }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {note.activity_type ? (
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", NOTE_ACTIVITY_CLS[note.activity_type])}>
              {NOTE_ACTIVITY_LABEL[note.activity_type]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" /> Nota
            </span>
          )}
          <span>{note.author ? fullName(note.author.first_name, note.author.last_name) : "—"}</span>
        </div>
        <span>{new Date(note.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      <p className="whitespace-pre-line text-foreground">{note.content}</p>
    </div>
  );
}

function HistoryLine({
  icon,
  title,
  meta,
  metaCls,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  metaCls?: string;
  body?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{title}</p>
          <span className={cn("shrink-0 text-[11px] text-muted-foreground", metaCls && "rounded-full px-2 py-0.5", metaCls)}>
            {meta}
          </span>
        </div>
        {body && <p className="text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

function DueBadge({
  bucket,
  date,
  time,
}: {
  bucket: ReturnType<typeof dueBucket>;
  date: string;
  time?: string | null;
}) {
  const hhmm = formatTimeAR(time ?? null);
  const at = hhmm ? ` ${hhmm}` : "";
  if (bucket.kind === "overdue")
    return <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">Vencida ({bucket.days}d)</span>;
  if (bucket.kind === "today")
    return <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-text">Hoy{at}</span>;
  if (bucket.kind === "tomorrow")
    return <span className="rounded-full bg-info/10 px-2 py-0.5 font-medium text-info">Mañana{at}</span>;
  return <span>Vence el {formatDateAR(date)}{at}</span>;
}

function dueMs(date: string | null, time: string | null): number {
  if (!date) return Number.MAX_SAFE_INTEGER; // sin vencimiento → al final
  return new Date(`${date}T${(time ?? "00:00").slice(0, 5)}`).getTime();
}

function defaultNext24h(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

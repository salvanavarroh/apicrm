"use client";

import { CalendarPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { DateTimePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  VISIT_STATUS_CLS,
  VISIT_STATUS_LABEL,
  formatDateTimeAR,
  isoToLocalDateTime,
  localDateTimeToIso,
  type VisitStatus,
} from "@/lib/tasks";

import {
  deleteVisit,
  scheduleVisit,
  updateVisitStatus,
} from "@/app/(app)/admin/leads/visit-actions";

export type LeadVisit = {
  id: string;
  scheduled_at: string;
  notes: string | null;
  status: VisitStatus;
  assigned_to: string | null;
  assignee_name: string | null;
};

type AssigneeOption = { id: string; name: string };

type Props = {
  leadId: string;
  visits: LeadVisit[];
  currentUserId: string;
  currentRole: "admin" | "manager" | "sales";
  assigneeOptions: AssigneeOption[];
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  readonly?: boolean;
};

const INHERIT_SENTINEL = "__inherit__";
const STATUS_OPTIONS: VisitStatus[] = [
  "scheduled",
  "completed",
  "no_show",
  "canceled",
];

export function VisitsSection({
  leadId,
  visits,
  currentUserId,
  currentRole,
  assigneeOptions,
  defaultAssigneeId,
  defaultAssigneeName,
  readonly,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<LeadVisit[]>(visits);
  const [lastSyncedVisits, setLastSyncedVisits] = useState(visits);
  const [open, setOpen] = useState(false);

  if (visits !== lastSyncedVisits) {
    setLastSyncedVisits(visits);
    setItems(visits);
  }

  function updateStatusLocal(visitId: string, status: VisitStatus) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((v) => (v.id === visitId ? { ...v, status } : v)),
    );
    startTransition(async () => {
      const r = await updateVisitStatus(visitId, status);
      if (!r.ok) {
        toast.error(r.message);
        setItems(snapshot);
      }
    });
  }

  function remove(visitId: string) {
    if (!confirm("¿Eliminar esta visita?")) return;
    const snapshot = items;
    setItems((prev) => prev.filter((v) => v.id !== visitId));
    startTransition(async () => {
      const r = await deleteVisit(visitId);
      if (!r.ok) {
        toast.error(r.message);
        setItems(snapshot);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Visitas</CardTitle>
        {!readonly && (
          <ScheduleVisitDialog
            leadId={leadId}
            open={open}
            onOpenChange={setOpen}
            currentUserId={currentUserId}
            currentRole={currentRole}
            assigneeOptions={assigneeOptions}
            defaultAssigneeId={defaultAssigneeId}
            defaultAssigneeName={defaultAssigneeName}
            onCreated={(visit) => {
              setItems((prev) => [visit, ...prev]);
              router.refresh();
            }}
            pending={pending}
            startTransition={startTransition}
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            No hay visitas agendadas
          </p>
        )}
        {items.map((v) => (
          <div
            key={v.id}
            className="flex flex-col gap-2 rounded-md border bg-card px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {formatDateTimeAR(v.scheduled_at)} hs
                </span>
                {v.assignee_name && (
                  <span className="text-[11px] text-muted-foreground">
                    Atiende:{" "}
                    {v.assigned_to === currentUserId
                      ? "Vos"
                      : v.assignee_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {readonly ? (
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${VISIT_STATUS_CLS[v.status]}`}
                  >
                    {VISIT_STATUS_LABEL[v.status]}
                  </span>
                ) : (
                  <Select
                    value={v.status}
                    onValueChange={(value) =>
                      updateStatusLocal(v.id, value as VisitStatus)
                    }
                  >
                    <SelectTrigger className="h-7 w-32 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {VISIT_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar visita"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            {v.notes && (
              <p className="text-xs text-muted-foreground">{v.notes}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ScheduleVisitDialog({
  leadId,
  open,
  onOpenChange,
  currentUserId,
  currentRole,
  assigneeOptions,
  defaultAssigneeId,
  defaultAssigneeName,
  onCreated,
  pending,
  startTransition,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string;
  currentRole: "admin" | "manager" | "sales";
  assigneeOptions: AssigneeOption[];
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  onCreated: (visit: LeadVisit) => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  // Vacío en initial render para no romper hidratación (Date.now distinto en
  // server vs client). Lo seteamos cuando se abre el dialog.
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState<string>(INHERIT_SENTINEL);

  // Cuando se abre el dialog, sugerir mañana a las 10:00 si no hay valor.
  useEffect(() => {
    if (open && !scheduledAt) {
      setScheduledAt(isoToLocalDateTime(defaultNext24h()));
    }
  }, [open, scheduledAt]);

  const canPickAssignee =
    currentRole !== "sales" && assigneeOptions.length > 0;

  function submit() {
    const iso = localDateTimeToIso(scheduledAt);
    if (!iso) {
      toast.error("Elegí una fecha y hora válidas");
      return;
    }
    const resolved =
      assignee === INHERIT_SENTINEL
        ? defaultAssigneeId
        : assignee;
    const resolvedName =
      assignee === INHERIT_SENTINEL
        ? defaultAssigneeName
        : (assigneeOptions.find((o) => o.id === assignee)?.name ?? null);
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`;
    const optimistic: LeadVisit = {
      id: tempId,
      scheduled_at: iso,
      notes: notes.trim() || null,
      status: "scheduled",
      assigned_to: resolved,
      assignee_name: resolvedName,
    };
    onCreated(optimistic);
    onOpenChange(false);

    const snapshot = { scheduledAt, notes, assignee };
    setNotes("");
    setAssignee(INHERIT_SENTINEL);
    setScheduledAt(isoToLocalDateTime(defaultNext24h()));

    startTransition(async () => {
      const r = await scheduleVisit(leadId, {
        scheduled_at: iso,
        notes: snapshot.notes,
        assigned_to: snapshot.assignee === INHERIT_SENTINEL ? "" : snapshot.assignee,
      });
      if (!r.ok) {
        toast.error(r.message);
        // Re-open dialog with old values
        setScheduledAt(snapshot.scheduledAt);
        setNotes(snapshot.notes);
        setAssignee(snapshot.assignee);
        onOpenChange(true);
        return;
      }
      toast.success("Visita agendada");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          <CalendarPlus className="mr-1.5 size-3.5" />
          Agendar visita
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar visita</DialogTitle>
          <DialogDescription>
            El cliente viene a la concesionaria. La visita queda asociada al
            lead y aparece en tu calendario.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">Fecha y hora</Label>
            <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
          </div>
          {canPickAssignee ? (
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Atiende</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT_SENTINEL}>
                    Vendedor del lead{defaultAssigneeName ? ` (${defaultAssigneeName})` : ""}
                  </SelectItem>
                  {assigneeOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">Notas (opcional)</Label>
            <Textarea
              rows={3}
              placeholder="Qué viene a ver, preferencias, recordatorios…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !scheduledAt}>
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Por defecto sugiere mañana a las 10:00 hora local. */
function defaultNext24h(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

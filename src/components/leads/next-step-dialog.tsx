"use client";

import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addLeadNote, addLeadTask, updateLeadStatus } from "@/app/(app)/admin/leads/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker, TimePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_TYPES, TASK_TYPE_LABEL, type TaskType } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// ============================================================================
// "¿Y ahora qué?" — se abre al completar la última acción abierta de un lead.
//
// El pedido, textual, de un vendedor de Piamonte: "luego de completar una acción
// el CRM debe obligarme a generar otra, y si me voy sin dejar programada ninguna
// acción ese lead se pierde". Tenía razón: marcar la tarea como hecha dejaba al
// lead sin próximo paso y sin que nada lo señalara.
//
// Por eso este diálogo NO se cierra tocando afuera ni con Escape: las dos
// únicas salidas son agendar el próximo paso o decir explícitamente que el lead
// no va más (que es una respuesta legítima, no una escapatoria).
//
// Sólo aparece cuando de verdad no quedó nada pendiente: si el vendedor ya tenía
// otra tarea o una visita agendada, no molesta.
// ============================================================================

/** Días por default para el próximo seguimiento. */
const DEFAULT_IN_DAYS = 3;

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NextStepDialog({
  open,
  leadId,
  leadName,
  completedLabel,
  onDone,
}: {
  open: boolean;
  leadId: string;
  leadName: string;
  /** Qué se acaba de completar, para que el vendedor sepa de dónde viene. */
  completedLabel: string;
  /** Se llama cuando el vendedor resolvió (agendó o cerró). */
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"schedule" | "drop">("schedule");

  const [taskType, setTaskType] = useState<TaskType>("follow_up");
  const [dueDate, setDueDate] = useState(() => isoDaysFromNow(DEFAULT_IN_DAYS));
  const [dueTime, setDueTime] = useState("");
  const [description, setDescription] = useState("");
  const [dropReason, setDropReason] = useState("");

  function schedule() {
    if (!dueDate) {
      toast.error("Elegí para cuándo");
      return;
    }
    start(async () => {
      const res = await addLeadTask(leadId, {
        task_type: taskType,
        description: description.trim() || undefined,
        priority: "medium",
        due_date: dueDate,
        due_time: dueTime || undefined,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Próximo paso agendado");
      onDone();
    });
  }

  function drop() {
    if (!dropReason.trim()) {
      toast.error("Contá por qué no va más: es lo que después explica el número");
      return;
    }
    start(async () => {
      const note = await addLeadNote(
        leadId,
        `Se cierra sin próximo paso: ${dropReason.trim()}`,
      );
      if (!note.ok) {
        toast.error(note.message);
        return;
      }
      const res = await updateLeadStatus(leadId, "not_interested");
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Lead cerrado como no interesado");
      onDone();
    });
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        // Sin salida por afuera ni por Escape: la gracia es justamente que
        // obligue a dejar el lead con un próximo paso.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" />
            ¿Y ahora qué con {leadName}?
          </DialogTitle>
          <DialogDescription>
            Completaste “{completedLabel}” y el lead quedó sin próximo paso. Dejá
            agendado qué sigue —o cerralo— para que no se pierda.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <ModeTab
            active={mode === "schedule"}
            onClick={() => setMode("schedule")}
            icon={CalendarClock}
            label="Agendar el próximo paso"
          />
          <ModeTab
            active={mode === "drop"}
            onClick={() => setMode("drop")}
            icon={XCircle}
            label="No va más"
          />
        </div>

        {mode === "schedule" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Qué vas a hacer</Label>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">Cuándo</Label>
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  min={isoDaysFromNow(0)}
                  clearable={false}
                  ariaLabel="Fecha del próximo paso"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">
                  Horario (opcional)
                </Label>
                <TimePicker
                  value={dueTime}
                  onChange={setDueTime}
                  ariaLabel="Horario del próximo paso"
                />
              </div>
            </div>

            {/* Atajos: el 90% de las veces es "seguimiento en unos días". */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { d: 1, l: "Mañana" },
                { d: 3, l: "En 3 días" },
                { d: 7, l: "En una semana" },
                { d: 15, l: "En 15 días" },
              ].map((s) => (
                <button
                  key={s.d}
                  type="button"
                  onClick={() => setDueDate(isoDaysFromNow(s.d))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    dueDate === isoDaysFromNow(s.d)
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground",
                  )}
                >
                  {s.l}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Nota para tu yo del futuro (opcional)
              </Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quedó esperando la cotización del usado…"
              />
            </div>

            <Button onClick={schedule} disabled={pending} className="w-full">
              Agendar y cerrar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Por qué no va más
              </Label>
              <Textarea
                rows={3}
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                placeholder="Compró en otra concesionaria / no tiene el dinero / número equivocado…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              El lead pasa a “No interesado” y deja de contar como activo. Queda
              el motivo en el historial.
            </p>
            <Button
              variant="outline"
              onClick={drop}
              disabled={pending}
              className="w-full"
            >
              Cerrar el lead
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

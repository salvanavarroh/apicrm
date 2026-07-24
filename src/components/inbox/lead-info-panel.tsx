"use client";

import {
  CalendarPlus,
  ExternalLink,
  Mail,
  MessageSquarePlus,
  Phone,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { Button } from "@/components/ui/button";
import {
  LEAD_STATUS_LABELS,
  LEAD_TEMPERATURE_META,
  LEAD_TEMPERATURE_OPTIONS,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";
import {
  NOTE_ACTIVITIES,
  NOTE_ACTIVITY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import {
  getLeadInfo,
  quickUpdateLead,
  type LeadInfo,
} from "@/app/(app)/admin/inbox/actions";
import { addLeadNote, addLeadTask } from "@/app/(app)/admin/leads/actions";

const STATUS_FLOW: LeadStatus[] = ["new", "contacted", "interested", "quoted"];

export function LeadInfoPanel({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<LeadInfo | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<null | "activity" | "task">(null);

  // Actividad
  const [actType, setActType] = useState<string>("other");
  const [actText, setActText] = useState("");
  // Tarea
  const [tType, setTType] = useState<string>("call");
  const [tDesc, setTDesc] = useState("");
  const [tDate, setTDate] = useState("");
  const [tTime, setTTime] = useState("");
  const [tPrio, setTPrio] = useState<string>("medium");

  useEffect(() => {
    getLeadInfo(leadId).then(setInfo);
  }, [leadId]);

  function setStatus(status: string) {
    start(async () => {
      const res = await quickUpdateLead(leadId, { status });
      if (res.ok) setInfo((p) => (p ? { ...p, status } : p));
      else toast.error(res.message);
    });
  }
  function setTemp(temperature: string) {
    start(async () => {
      const res = await quickUpdateLead(leadId, { temperature });
      if (res.ok) setInfo((p) => (p ? { ...p, temperature } : p));
      else toast.error(res.message);
    });
  }
  function saveActivity() {
    if (!actText.trim()) return;
    start(async () => {
      const res = await addLeadNote(
        leadId,
        actText.trim(),
        actType === "other" ? null : (actType as never),
      );
      if (res.ok) {
        toast.success("Actividad registrada");
        setActText("");
        setTab(null);
      } else toast.error(res.message);
    });
  }
  function saveTask() {
    start(async () => {
      const res = await addLeadTask(leadId, {
        task_type: tType as never,
        description: tDesc,
        priority: tPrio as never,
        due_date: tDate,
        due_time: tTime,
      });
      if (res.ok) {
        toast.success("Tarea agendada");
        setTDesc("");
        setTDate("");
        setTTime("");
        setTab(null);
      } else toast.error(res.message);
    });
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Información del lead</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {!info ? (
        <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <ContactAvatar name={info.name} size="lg" />
            <div className="min-w-0">
              <div className="truncate font-medium">{info.name}</div>
              {info.assigned_name && (
                <div className="text-xs text-muted-foreground">
                  Vendedor: {info.assigned_name}
                </div>
              )}
            </div>
          </div>

          {/* Contacto rápido */}
          <div className="grid grid-cols-2 gap-2">
            {info.phone_e164 && (
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${info.phone_e164}`}>
                  <Phone className="mr-1 size-3.5" /> Llamar
                </a>
              </Button>
            )}
            {info.email && (
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${info.email}`}>
                  <Mail className="mr-1 size-3.5" /> Email
                </a>
              </Button>
            )}
          </div>

          {/* Actividad / Tarea */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={tab === "activity" ? "default" : "outline"}
              onClick={() => setTab(tab === "activity" ? null : "activity")}
            >
              <MessageSquarePlus className="mr-1 size-3.5" /> Actividad
            </Button>
            <Button
              size="sm"
              variant={tab === "task" ? "default" : "outline"}
              onClick={() => setTab(tab === "task" ? null : "task")}
            >
              <CalendarPlus className="mr-1 size-3.5" /> Tarea
            </Button>
          </div>

          {tab === "activity" && (
            <div className="space-y-2 rounded-md border p-2">
              <select
                value={actType}
                onChange={(e) => setActType(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              >
                {NOTE_ACTIVITIES.map((a) => (
                  <option key={a} value={a}>
                    {NOTE_ACTIVITY_LABEL[a]}
                  </option>
                ))}
              </select>
              <textarea
                value={actText}
                onChange={(e) => setActText(e.target.value)}
                rows={2}
                placeholder="Detalle de la actividad…"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              />
              <Button size="sm" className="w-full" onClick={saveActivity} disabled={pending || !actText.trim()}>
                Registrar
              </Button>
            </div>
          )}

          {tab === "task" && (
            <div className="space-y-2 rounded-md border p-2">
              <select
                value={tType}
                onChange={(e) => setTType(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <textarea
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                rows={2}
                placeholder="Descripción (opcional)…"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={tDate}
                  onChange={(e) => setTDate(e.target.value)}
                  className="flex-1 rounded-md border px-2 py-1.5 text-sm"
                />
                <input
                  type="time"
                  value={tTime}
                  onChange={(e) => setTTime(e.target.value)}
                  className="w-24 rounded-md border px-2 py-1.5 text-sm"
                />
              </div>
              <select
                value={tPrio}
                onChange={(e) => setTPrio(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              >
                {Object.entries(TASK_PRIORITY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    Prioridad: {l}
                  </option>
                ))}
              </select>
              <Button size="sm" className="w-full" onClick={saveTask} disabled={pending}>
                Agendar tarea
              </Button>
            </div>
          )}

          {/* Estado */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Estado</div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FLOW.map((s) => (
                <button
                  key={s}
                  disabled={pending}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    info.status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Temperatura */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Temperatura</div>
            <div className="flex gap-1">
              {LEAD_TEMPERATURE_OPTIONS.map((t) => {
                const meta = LEAD_TEMPERATURE_META[t.value as LeadTemperature];
                const active = info.temperature === t.value;
                return (
                  <button
                    key={t.value}
                    disabled={pending}
                    onClick={() => setTemp(t.value)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      active ? meta.badge : "border hover:bg-muted",
                    )}
                  >
                    {meta.emoji} {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datos */}
          <dl className="space-y-1.5 border-t pt-3 text-sm">
            <Row label="Teléfono" value={info.phone_e164 ?? info.phone} />
            <Row label="Email" value={info.email} />
            <Row label="Ciudad" value={info.city} />
            <Row label="Vehículo" value={info.vehicle} />
            <Row
              label="Presupuesto"
              value={
                info.budget_min || info.budget_max
                  ? `${info.budget_min ?? "?"} - ${info.budget_max ?? "?"}`
                  : null
              }
            />
            <Row label="Fuente" value={info.source} />
            <Row label="Campaña" value={info.campaign_name} />
          </dl>
        </div>
      )}

      {info && (
        <div className="border-t p-3">
          <Button asChild className="w-full">
            <Link href={`/admin/leads/${info.id}`}>
              <ExternalLink className="mr-1 size-4" /> Ver ficha completa
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

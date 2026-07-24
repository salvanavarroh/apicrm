"use client";

import { Phone, Mail, X, ExternalLink } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  getLeadInfo,
  quickAddNote,
  quickUpdateLead,
  type LeadInfo,
} from "@/app/(app)/admin/inbox/actions";

const STATUS_FLOW: LeadStatus[] = ["new", "contacted", "interested", "quoted"];

export function LeadInfoPanel({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<LeadInfo | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    getLeadInfo(leadId).then(setInfo);
  }, [leadId]);

  function setStatus(status: string) {
    start(async () => {
      const res = await quickUpdateLead(leadId, { status });
      if (res.ok) {
        setInfo((p) => (p ? { ...p, status } : p));
        toast.success("Estado actualizado");
      } else toast.error(res.message);
    });
  }
  function setTemp(temperature: string) {
    start(async () => {
      const res = await quickUpdateLead(leadId, { temperature });
      if (res.ok) {
        setInfo((p) => (p ? { ...p, temperature } : p));
      } else toast.error(res.message);
    });
  }
  function addNote() {
    const body = note.trim();
    if (!body) return;
    start(async () => {
      const res = await quickAddNote(leadId, body);
      if (res.ok) {
        setNote("");
        toast.success("Nota agregada");
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

          {/* Quick actions */}
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

          {/* Nota rápida */}
          <div className="border-t pt-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Nota interna</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Agregar una nota…"
              className="w-full rounded-md border px-2 py-1.5 text-sm"
            />
            <Button size="sm" variant="outline" className="mt-1 w-full" onClick={addNote} disabled={pending || !note.trim()}>
              Guardar nota
            </Button>
          </div>
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

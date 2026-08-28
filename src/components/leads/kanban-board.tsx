"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  LEAD_STATUS_LABELS,
  fullName,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";

import { updateLeadStatus } from "@/app/(app)/admin/leads/actions";
import { fetchKanbanColumn } from "@/lib/kanban-actions";

import { LeadStatusBadge } from "./lead-status-badge";
import { TemperatureBadge } from "./temperature-control";

export type KanbanLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  vehicle_version: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  branch_name: string | null;
  product_type_name: string | null;
  assignee_name: string | null;
  status_changed_at: string | null;
  /** Última gestión real: es lo que mide el reloj y el punto de la tarjeta. */
  last_managed_at: string | null;
  // Mensajes sin responder (WhatsApp/IG/FB) del lead. >0 → badge en la tarjeta.
  unread: number;
};

const COLUMN_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
  "evaluating",
  "accepted",
  "rejected",
  "closed",
  "not_interested",
];

// Fondo suave de columna por estado (header tinted + body con misma tinta).
// Los `dark:` son necesarios: sin ellos las columnas quedan blancas sobre fondo
// oscuro y el tablero pierde toda la lectura por color.
const COLUMN_TINT: Record<LeadStatus, string> = {
  new: "bg-blue-50/80 dark:bg-blue-950/30",
  contacted: "bg-amber-50/80 dark:bg-amber-950/30",
  interested: "bg-emerald-50/80 dark:bg-emerald-950/30",
  quoted: "bg-green-50/80 dark:bg-green-950/30",
  evaluating: "bg-orange-50/80 dark:bg-orange-950/30",
  accepted: "bg-emerald-50 dark:bg-emerald-950/40",
  rejected: "bg-red-50/80 dark:bg-red-950/30",
  closed: "bg-zinc-100/80 dark:bg-zinc-900/50",
  not_interested: "bg-zinc-100/60 dark:bg-zinc-900/40",
};

// Filete superior de la columna: hace que el tablero se lea como un pipeline
// (frío → cálido → cerrado) y no como nueve cajas iguales.
const COLUMN_ACCENT: Record<LeadStatus, string> = {
  new: "bg-blue-400",
  contacted: "bg-amber-400",
  interested: "bg-emerald-400",
  quoted: "bg-green-500",
  evaluating: "bg-orange-400",
  accepted: "bg-emerald-600",
  rejected: "bg-red-400",
  closed: "bg-zinc-400",
  not_interested: "bg-zinc-300 dark:bg-zinc-600",
};

const KANBAN_ACTIVE: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Recién";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d`;
  return `${Math.floor(days / 30)} m`;
}

type Props = {
  // Carga inicial: top-N por columna (no todos los leads).
  leads: KanbanLead[];
  detailHrefPrefix: string;
  // Conteo real por estado (para el header y saber si hay "cargar más").
  counts?: Partial<Record<LeadStatus, number>>;
};

export function KanbanBoard({ leads, detailHrefPrefix, counts }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Optimistic state local — al soltar, actualizamos UI inmediatamente y luego
  // confirmamos en servidor. También acumula lo que trae "cargar más".
  const [optimistic, setOptimistic] = useState<KanbanLead[]>(leads);
  const [countMap, setCountMap] = useState<Partial<Record<LeadStatus, number>>>(
    counts ?? {},
  );
  const [loadingCol, setLoadingCol] = useState<LeadStatus | null>(null);

  // Reset SÓLO cuando cambia la prop `leads` por referencia (nuevo render del
  // server), no en cada render — si no, "cargar más" se revertiría solo.
  const [prevLeads, setPrevLeads] = useState(leads);
  if (prevLeads !== leads) {
    setPrevLeads(leads);
    setOptimistic(leads);
    setCountMap(counts ?? {});
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const leadId = String(e.active.id);
    const target = String(e.over.id) as LeadStatus;
    const lead = optimistic.find((l) => l.id === leadId);
    if (!lead || lead.status === target) return;
    const from = lead.status;

    setOptimistic((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: target } : l)),
    );
    setCountMap((c) => ({
      ...c,
      [from]: Math.max(0, (c[from] ?? 1) - 1),
      [target]: (c[target] ?? 0) + 1,
    }));

    startTransition(async () => {
      const result = await updateLeadStatus(leadId, target);
      if (!result.ok) {
        toast.error(result.message);
        // Revertir
        setOptimistic((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: from } : l)),
        );
        setCountMap((c) => ({
          ...c,
          [target]: Math.max(0, (c[target] ?? 1) - 1),
          [from]: (c[from] ?? 0) + 1,
        }));
        return;
      }
      router.refresh();
    });
  }

  async function loadMore(status: LeadStatus) {
    const loaded = optimistic.filter((l) => l.status === status).length;
    setLoadingCol(status);
    try {
      const more = await fetchKanbanColumn(status, loaded);
      setOptimistic((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...more.filter((m) => !seen.has(m.id))];
      });
    } catch {
      toast.error("No pude cargar más leads");
    } finally {
      setLoadingCol(null);
    }
  }

  const activeLead = optimistic.find((l) => l.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="overflow-x-auto pb-2">
        <div className="grid auto-rows-min grid-flow-col gap-3 [grid-auto-columns:minmax(220px,1fr)]">
          {COLUMN_ORDER.map((status) => {
            const items = optimistic.filter((l) => l.status === status);
            return (
              <Column
                key={status}
                status={status}
                count={countMap[status] ?? items.length}
                items={items}
                detailHrefPrefix={detailHrefPrefix}
                onLoadMore={() => loadMore(status)}
                loading={loadingCol === status}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activeLead && <Card lead={activeLead} dragging detailHrefPrefix="" />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  count,
  items,
  detailHrefPrefix,
  onLoadMore,
  loading,
}: {
  status: LeadStatus;
  count: number;
  items: KanbanLead[];
  detailHrefPrefix: string;
  onLoadMore: () => void;
  loading: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const tint = COLUMN_TINT[status];
  // Cuántos faltan por traer del server (el count real menos lo ya cargado).
  const remaining = Math.max(0, count - items.length);
  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border p-3 pt-3.5 transition-colors ${tint} ${
        isOver ? "ring-2 ring-accent" : ""
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 ${COLUMN_ACCENT[status]}`}
      />
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-sm font-semibold text-foreground">
          {LEAD_STATUS_LABELS[status]}
        </span>
        <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-card px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm">
          {count.toLocaleString("es-AR")}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
            {isOver ? "Soltá acá" : "Sin leads"}
          </p>
        )}
        {items.map((lead) => (
          <Card
            key={lead.id}
            lead={lead}
            detailHrefPrefix={detailHrefPrefix}
          />
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-md border border-dashed border-border bg-card/60 py-2 text-xs font-medium text-muted-foreground hover:bg-card disabled:opacity-60"
          >
            {loading
              ? "Cargando…"
              : `Cargar más (${remaining.toLocaleString("es-AR")})`}
          </button>
        )}
      </div>
    </div>
  );
}

function Card({
  lead,
  detailHrefPrefix,
  dragging,
}: {
  lead: KanbanLead;
  detailHrefPrefix: string;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const vehicle = [lead.vehicle_model, lead.vehicle_version]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border bg-card p-3 text-xs shadow-sm transition-shadow ${
        lead.unread > 0
          ? "border-emerald-400 ring-1 ring-emerald-400/50"
          : "border-border"
      } ${
        isDragging || dragging ? "opacity-90 shadow-md" : "hover:shadow-md"
      } cursor-grab active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <StaleDot lead={lead} />
          <p className="truncate text-sm font-semibold text-foreground">
            {fullName(lead.first_name, lead.last_name)}
          </p>
          {lead.unread > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              title={`${lead.unread} mensaje${lead.unread === 1 ? "" : "s"} sin responder`}
            >
              <MessageCircle className="size-2.5" /> {lead.unread}
            </span>
          )}
        </div>
        <LeadStatusBadge status={lead.status} className="shrink-0 text-[10px]" />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{vehicle || "—"}</p>
        {lead.temperature && (
          <TemperatureBadge
            temperature={lead.temperature}
            className="shrink-0 text-[10px]"
          />
        )}
      </div>

      <div className="mt-3 border-t pt-2">
        {detailHrefPrefix && !lead.assignee_name && lead.status === "new" ? (
          <div className="flex items-center justify-between">
            <Link
              href={`${detailHrefPrefix}/${lead.id}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              Asignar vendedor
            </Link>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ClockIcon /> {timeAgo(lead.last_managed_at)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-muted-foreground">
              {lead.assignee_name ?? "Sin asignar"}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <ClockIcon /> {timeAgo(lead.last_managed_at)}
            </span>
          </div>
        )}
      </div>

      {detailHrefPrefix && (lead.assignee_name || lead.status !== "new") && (
        <Link
          href={`${detailHrefPrefix}/${lead.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 inline-block text-[10px] font-medium text-accent hover:underline"
        >
          Abrir detalle →
        </Link>
      )}
    </div>
  );
}

/**
 * Punto de gestión en la tarjeta: mismo criterio que la tabla y que el semáforo
 * del dashboard (verde <3 días, ámbar 3-7, rojo +7 desde la última gestión).
 * Sólo en estados activos.
 */
function StaleDot({ lead }: { lead: KanbanLead }) {
  if (!KANBAN_ACTIVE.includes(lead.status) || !lead.last_managed_at) {
    return null;
  }
  const days = daysSince(lead.last_managed_at);
  if (days < 3) return null; // Al día: no agregamos ruido visual.
  return (
    <span
      title={`${days} días sin gestión`}
      aria-label={`${days} días sin gestión`}
      className={`size-1.5 shrink-0 rounded-full ${
        days >= 7 ? "bg-destructive" : "bg-warning"
      }`}
    />
  );
}

function ClockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

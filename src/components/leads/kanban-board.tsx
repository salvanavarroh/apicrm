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
const COLUMN_TINT: Record<LeadStatus, string> = {
  new: "bg-blue-50/80",
  contacted: "bg-amber-50/80",
  interested: "bg-emerald-50/80",
  quoted: "bg-green-50/80",
  evaluating: "bg-orange-50/80",
  accepted: "bg-emerald-50",
  rejected: "bg-red-50/80",
  closed: "bg-zinc-100/80",
  not_interested: "bg-zinc-100/60",
};

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
  leads: KanbanLead[];
  detailHrefPrefix: string;
};

export function KanbanBoard({ leads, detailHrefPrefix }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Optimistic state local — al soltar, actualizamos UI inmediatamente y luego
  // confirmamos en servidor.
  const [optimistic, setOptimistic] = useState<KanbanLead[]>(leads);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Re-sync si props cambian (después de refresh).
  if (leads !== optimistic && leads.length !== optimistic.length) {
    setOptimistic(leads);
  }

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

    setOptimistic((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: target } : l)),
    );

    startTransition(async () => {
      const result = await updateLeadStatus(leadId, target);
      if (!result.ok) {
        toast.error(result.message);
        // Revertir
        setOptimistic((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l)),
        );
        return;
      }
      router.refresh();
    });
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
                count={items.length}
                items={items}
                detailHrefPrefix={detailHrefPrefix}
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
}: {
  status: LeadStatus;
  count: number;
  items: KanbanLead[];
  detailHrefPrefix: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const tint = COLUMN_TINT[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-lg border border-border p-3 transition-colors ${tint} ${
        isOver ? "ring-2 ring-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-sm font-semibold text-foreground">
          {LEAD_STATUS_LABELS[status]}
        </span>
        <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-card px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm">
          {count}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sin leads
          </p>
        )}
        {items.map((lead) => (
          <Card
            key={lead.id}
            lead={lead}
            detailHrefPrefix={detailHrefPrefix}
          />
        ))}
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
      className={`rounded-md border border-border bg-card p-3 text-xs shadow-sm transition-shadow ${
        isDragging || dragging ? "opacity-90 shadow-md" : "hover:shadow-md"
      } cursor-grab active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {fullName(lead.first_name, lead.last_name)}
        </p>
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
              <ClockIcon /> {timeAgo(lead.status_changed_at)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-muted-foreground">
              {lead.assignee_name ?? "Sin asignar"}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <ClockIcon /> {timeAgo(lead.status_changed_at)}
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

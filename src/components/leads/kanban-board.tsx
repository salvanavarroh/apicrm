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
} from "@/lib/leads";

import { updateLeadStatus } from "@/app/(app)/admin/leads/actions";

import { LeadStatusBadge } from "./lead-status-badge";

export type KanbanLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  status: LeadStatus;
  branch_name: string | null;
  product_type_name: string | null;
};

const COLUMN_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
  "not_interested",
];

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
      <div className="grid auto-rows-min gap-3 overflow-x-auto pb-2 sm:grid-cols-5">
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
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors ${
        isOver ? "bg-accent/10" : ""
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {LEAD_STATUS_LABELS[status]}
        </span>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border border-border bg-card p-2.5 text-xs shadow-sm transition-shadow ${
        isDragging || dragging ? "shadow-md opacity-90" : "hover:shadow-md"
      } cursor-grab active:cursor-grabbing`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">
          {fullName(lead.first_name, lead.last_name)}
        </p>
        <LeadStatusBadge status={lead.status} className="text-[9px]" />
      </div>
      {lead.vehicle_model && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {lead.vehicle_model}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {lead.phone || "—"}
      </p>
      {detailHrefPrefix && (
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

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/leads";

import { reassignLead } from "@/app/(app)/admin/leads/actions";

export type AssignableUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  branchName: string | null;
  productTypeIds: string[];
  // Cobertura "Todos": el vendedor cubre cualquier tipo de producto.
  coversAll?: boolean;
  activeLeads: number;
  maxCapacity: number;
};

type Props = {
  trigger: React.ReactNode;
  leadId: string;
  leadProductTypeId: string | null;
  currentAssigneeId: string | null;
  users: AssignableUser[];
};

function getCapacityState(active: number, max: number): {
  pct: number;
  label: string;
  badgeCls: string;
  barCls: string;
} {
  const pct = Math.min(100, Math.round((active / Math.max(1, max)) * 100));
  if (pct >= 100) {
    return {
      pct,
      label: "LLENO",
      badgeCls: "bg-destructive text-white",
      barCls: "bg-destructive",
    };
  }
  if (pct >= 80) {
    return {
      pct,
      label: "CASI LLENO",
      badgeCls: "bg-warning text-warning-foreground",
      barCls: "bg-warning",
    };
  }
  return {
    pct,
    label: "DISPONIBLE",
    badgeCls: "bg-success text-success-foreground",
    barCls: "bg-success",
  };
}

export function ReassignDialog({
  trigger,
  leadId,
  leadProductTypeId,
  currentAssigneeId,
  users,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    currentAssigneeId,
  );
  const [pending, startTransition] = useTransition();

  const eligible = leadProductTypeId
    ? users.filter(
        (u) => u.coversAll || u.productTypeIds.includes(leadProductTypeId),
      )
    : users;

  function submit() {
    startTransition(async () => {
      const result = await reassignLead(leadId, selectedId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(selectedId ? "Lead asignado" : "Lead desasignado");
      setOpen(false);
      router.refresh();
    });
  }

  function unassign() {
    setSelectedId(null);
    submit();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="!max-w-lg overflow-hidden">
        <DialogHeader className="text-center">
          <DialogTitle className="text-center text-xl">
            Asignar vendedor
          </DialogTitle>
          <DialogDescription className="text-center">
            Seleccioná un vendedor para asignar el lead.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Balance de Carga · Disponibilidad
          </h3>

          {eligible.length === 0 ? (
            <p className="rounded-md border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
              No hay vendedores disponibles para el tipo de producto del lead.
            </p>
          ) : (
            <ul className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
              {eligible.map((u) => {
                const cap = getCapacityState(u.activeLeads, u.maxCapacity);
                const selected = selectedId === u.id;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className={cn(
                        "flex w-full flex-col gap-2 rounded-md border bg-card px-3 py-3 text-left transition-colors hover:border-accent",
                        selected
                          ? "border-accent ring-1 ring-accent"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                          {initials(u.first_name, u.last_name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {fullName(u.first_name, u.last_name)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.branchName ? `${u.branchName} · ` : ""}
                            {u.activeLeads} de {u.maxCapacity} leads
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold tracking-wide",
                            cap.badgeCls,
                          )}
                        >
                          {cap.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full transition-all", cap.barCls)}
                            style={{ width: `${cap.pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                          {cap.pct}% de capacidad
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {currentAssigneeId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={unassign}
              disabled={pending}
              className="mr-auto text-destructive"
            >
              Desasignar
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="flex-1 sm:flex-initial"
          >
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !selectedId || eligible.length === 0}
            className="flex-1 sm:flex-initial"
          >
            {pending ? "Asignando…" : "Asignar lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initials(first: string | null, last: string | null) {
  const f = (first ?? "").trim().charAt(0).toUpperCase();
  const l = (last ?? "").trim().charAt(0).toUpperCase();
  return (f + l) || "VD";
}

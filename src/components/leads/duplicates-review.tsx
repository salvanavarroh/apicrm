"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";
import { cn } from "@/lib/utils";

import {
  getGroupLeads,
  mergeLeads,
  type DuplicateGroup,
  type GroupLead,
} from "@/app/(app)/admin/leads/duplicates/actions";

type Props = { groups: DuplicateGroup[] };

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function DuplicatesReview({ groups }: Props) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay leads duplicados por teléfono. 🎉
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {groups.length} {groups.length === 1 ? "grupo" : "grupos"} de leads con
        el mismo teléfono. Revisá cada uno y confirmá la unificación.
      </p>
      {groups.map((g) => (
        <GroupCard key={g.phone_e164} group={g} />
      ))}
    </div>
  );
}

function GroupCard({ group }: { group: DuplicateGroup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<GroupLead[] | null>(null);
  const [survivor, setSurvivor] = useState<string | null>(null);
  const [absorbed, setAbsorbed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isMerging, startMerge] = useTransition();

  async function expand() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (leads) return;
    setLoading(true);
    const data = await getGroupLeads(group.phone_e164);
    setLeads(data);
    const suggested = data.find((l) => l.suggested_survivor) ?? data[0];
    if (suggested) {
      setSurvivor(suggested.id);
      setAbsorbed(new Set(data.filter((l) => l.id !== suggested.id).map((l) => l.id)));
    }
    setLoading(false);
  }

  function pickSurvivor(id: string) {
    setSurvivor(id);
    setAbsorbed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      // El resto que estaba marcado sigue; garantizamos que el nuevo survivor no esté.
      return next;
    });
  }

  function toggleAbsorbed(id: string) {
    if (id === survivor) return;
    setAbsorbed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doMerge() {
    if (!survivor || absorbed.size === 0) {
      toast.error("Elegí el lead que queda y al menos uno a unificar");
      return;
    }
    startMerge(async () => {
      const res = await mergeLeads(survivor, Array.from(absorbed));
      if (res.ok) {
        toast.success("Leads unificados");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="rounded-lg border">
      <button
        onClick={expand}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm">{group.phone_e164}</span>
          <Badge variant="secondary">{group.lead_count} leads</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {open ? "Ocultar" : "Revisar"}
        </span>
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {loading && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Cargando…
            </p>
          )}
          {leads && (
            <>
              <div className="space-y-2">
                {leads.map((l) => {
                  const isSurvivor = l.id === survivor;
                  const willAbsorb = absorbed.has(l.id);
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-sm",
                        isSurvivor && "border-primary bg-primary/5",
                        willAbsorb && "opacity-70",
                      )}
                    >
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={`survivor-${group.phone_e164}`}
                          checked={isSurvivor}
                          onChange={() => pickSurvivor(l.id)}
                        />
                        <span className="text-xs font-medium text-primary">
                          {isSurvivor ? "Queda" : "Dejar"}
                        </span>
                      </label>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{l.name}</span>
                          {l.suggested_survivor && (
                            <Badge variant="outline" className="text-[10px]">
                              sugerido
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status}
                          </Badge>
                          {l.has_sale && (
                            <Badge className="bg-emerald-600 text-[10px] text-white">
                              venta
                            </Badge>
                          )}
                          {l.has_quote && !l.has_sale && (
                            <Badge variant="outline" className="text-[10px]">
                              presupuesto
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {l.email ?? "sin email"} · {l.assigned_to ?? "sin vendedor"}{" "}
                          · últ. actividad {fmtDate(l.last_activity)}
                        </div>
                      </div>

                      {!isSurvivor && (
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={willAbsorb}
                            onChange={() => toggleAbsorbed(l.id)}
                          />
                          Unificar
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Se moverán notas, tareas, visitas, presupuestos, ventas y
                  consultas al lead que queda.
                </p>
                <Button
                  size="sm"
                  onClick={doMerge}
                  disabled={isMerging || !survivor || absorbed.size === 0}
                >
                  {isMerging
                    ? "Unificando…"
                    : `Unificar ${absorbed.size} en 1`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

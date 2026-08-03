"use client";

import { Headphones } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setCallCenterSettings } from "@/app/(app)/admin/company/actions";

const DAYS = [
  { v: 1, l: "Lun" },
  { v: 2, l: "Mar" },
  { v: 3, l: "Mié" },
  { v: 4, l: "Jue" },
  { v: 5, l: "Vie" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

export type CallCenterSettings = {
  maxOpenPerVendor: number | null;
  hoursEnabled: boolean;
  hoursStart: string | null; // "HH:MM"
  hoursEnd: string | null;
  hoursDays: number[]; // ISO 1..7
};

// Config del call center: tope de conversaciones abiertas por vendedor (overflow)
// + horario de atención (fuera de hora, las conversaciones caen al pool).
export function CallCenterSettingsCard({ initial }: { initial: CallCenterSettings }) {
  const [maxOpen, setMaxOpen] = useState(
    initial.maxOpenPerVendor?.toString() ?? "",
  );
  const [hoursEnabled, setHoursEnabled] = useState(initial.hoursEnabled);
  const [start, setStart] = useState(initial.hoursStart ?? "09:00");
  const [end, setEnd] = useState(initial.hoursEnd ?? "19:00");
  const [days, setDays] = useState<number[]>(
    initial.hoursDays.length ? initial.hoursDays : [1, 2, 3, 4, 5, 6],
  );
  const [pending, run] = useTransition();

  function toggleDay(d: number) {
    setDays((p) =>
      p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort((a, b) => a - b),
    );
  }

  function save() {
    run(async () => {
      const res = await setCallCenterSettings({
        maxOpenPerVendor: maxOpen ? Number(maxOpen) : null,
        hoursEnabled,
        hoursStart: start,
        hoursEnd: end,
        hoursDays: days,
      });
      if (res.ok) toast.success("Configuración del call center guardada");
      else toast.error(res.message);
    });
  }

  return (
    <Card className="flex h-fit flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <Headphones className="size-5 text-accent" />
        <h3 className="text-lg font-semibold">Call center</h3>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Cómo se reparten las conversaciones entre los vendedores activos.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">
          Máx. conversaciones abiertas por vendedor
        </label>
        <input
          type="number"
          min={1}
          value={maxOpen}
          onChange={(e) => setMaxOpen(e.target.value)}
          placeholder="Sin tope"
          className="w-40 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Si todos los activos llegan al tope, las nuevas caen al pool. Vacío = sin
          tope.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={hoursEnabled}
            onChange={(e) => setHoursEnabled(e.target.checked)}
            className="size-4"
          />
          Repartir solo en horario de atención
        </label>
        {hoursEnabled && (
          <div className="flex flex-col gap-2 pl-6">
            <div className="flex items-center gap-2 text-sm">
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5"
              />
              <span className="text-muted-foreground">a</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => toggleDay(d.v)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    days.includes(d.v)
                      ? "border-accent bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.l}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fuera de este horario, las conversaciones nuevas caen al pool.
            </p>
          </div>
        )}
      </div>

      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}

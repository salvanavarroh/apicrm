"use client";

import { CalendarDays, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ============================================================================
// Filtro por rango de fechas para las pantallas de ventas.
//
// Se resuelve en el cliente sobre las filas ya cargadas: el volumen de ventas
// por concesionaria es chico (decenas, no miles), así que filtrar en memoria es
// instantáneo y evita un round-trip por cada cambio de fecha.
//
// Vive acá y no dentro de cada pantalla porque lo usan tres: la de admin, la de
// gerente y la del vendedor.
// ============================================================================

const PRESETS: { label: string; days: number }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Fuera del componente: la regla de pureza de React no deja llamar Date.now()
// durante el render.
function todayYmd(): string {
  return ymd(new Date());
}
function daysAgoYmd(n: number): string {
  return ymd(new Date(Date.now() - n * 86_400_000));
}

export type DateRangeFilter = {
  from: string;
  to: string;
  preset: number | null;
  hasRange: boolean;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  applyPreset: (days: number) => void;
  clear: () => void;
  /** Filtra por una fecha ISO tomando sólo el día. */
  matches: (isoDate: string) => boolean;
};

export function useDateRangeFilter(): DateRangeFilter {
  const [from, setFromState] = useState("");
  const [to, setToState] = useState("");
  const [preset, setPreset] = useState<number | null>(null);

  return useMemo(
    () => ({
      from,
      to,
      preset,
      hasRange: Boolean(from || to),
      setFrom: (v: string) => {
        setPreset(null);
        setFromState(v);
      },
      setTo: (v: string) => {
        setPreset(null);
        setToState(v);
      },
      applyPreset: (days: number) => {
        setPreset(days);
        setFromState(daysAgoYmd(days));
        setToState(todayYmd());
      },
      clear: () => {
        setPreset(null);
        setFromState("");
        setToState("");
      },
      matches: (isoDate: string) => {
        if (!from && !to) return true;
        const day = isoDate.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      },
    }),
    [from, to, preset],
  );
}

export function SalesDateFilter({
  filter,
  shown,
  total,
  className,
}: {
  filter: DateRangeFilter;
  /** Cuántas filas quedaron visibles, para el contador. */
  shown: number;
  total: number;
  className?: string;
}) {
  const hidden = total - shown;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3",
        className,
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      <div className="inline-flex rounded-lg border p-0.5">
        {PRESETS.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => filter.applyPreset(r.days)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              filter.preset === r.days
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <Input
        type="date"
        value={filter.from}
        max={filter.to || undefined}
        onChange={(e) => filter.setFrom(e.target.value)}
        className="h-8 w-36"
        aria-label="Desde"
      />
      <span className="text-xs text-muted-foreground">→</span>
      <Input
        type="date"
        value={filter.to}
        min={filter.from || undefined}
        onChange={(e) => filter.setTo(e.target.value)}
        className="h-8 w-36"
        aria-label="Hasta"
      />
      {filter.hasRange && (
        <>
          <Button variant="ghost" size="sm" onClick={filter.clear}>
            <X className="mr-1 size-3.5" /> Limpiar
          </Button>
          <span className="text-xs text-muted-foreground">
            {shown} de {total}
            {hidden > 0 ? ` · ${hidden} fuera del rango` : ""}
          </span>
        </>
      )}
    </div>
  );
}

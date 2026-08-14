"use client";

import { CalendarDays } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Barra de rango de los reportes del catálogo. El rango viaja por la URL para
// que un reporte filtrado se pueda compartir o dejar en favoritos.

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS: { label: string; compute: () => { from: string; to: string } }[] =
  [
    {
      label: "Últimas 24 h",
      compute: () => {
        const now = new Date();
        return {
          from: toKey(new Date(now.getTime() - 86_400_000)),
          to: toKey(now),
        };
      },
    },
    {
      label: "7 días",
      compute: () => {
        const now = new Date();
        return {
          from: toKey(new Date(now.getTime() - 7 * 86_400_000)),
          to: toKey(now),
        };
      },
    },
    {
      label: "30 días",
      compute: () => {
        const now = new Date();
        return {
          from: toKey(new Date(now.getTime() - 30 * 86_400_000)),
          to: toKey(now),
        };
      },
    },
    {
      label: "90 días",
      compute: () => {
        const now = new Date();
        return {
          from: toKey(new Date(now.getTime() - 90 * 86_400_000)),
          to: toKey(now),
        };
      },
    },
    {
      label: "Este trimestre",
      compute: () => {
        const now = new Date();
        const q = Math.floor(now.getMonth() / 3);
        return {
          from: toKey(new Date(now.getFullYear(), q * 3, 1)),
          to: toKey(now),
        };
      },
    },
    {
      label: "Este año",
      compute: () => {
        const now = new Date();
        return {
          from: toKey(new Date(now.getFullYear(), 0, 1)),
          to: toKey(now),
        };
      },
    },
  ];

export function ReportRangeBar({
  basePath,
  from,
  to,
}: {
  basePath: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function setRange(next: { from?: string; to?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3",
        pending && "opacity-70",
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const r = p.compute();
          const active = from === r.from && to === r.to;
          return (
            <button
              key={p.label}
              type="button"
              disabled={pending}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Input
          type="date"
          value={from}
          max={to}
          disabled={pending}
          onChange={(e) => setRange({ from: e.target.value })}
          className="h-8 w-36"
          aria-label="Desde"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={to}
          min={from}
          disabled={pending}
          onChange={(e) => setRange({ to: e.target.value })}
          className="h-8 w-36"
          aria-label="Hasta"
        />
      </div>
    </div>
  );
}

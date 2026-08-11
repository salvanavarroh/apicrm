import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

// ============================================================================
// Encabezado de sección con banner.
//
// Reemplaza el header "título + párrafo gris" que hacía que las pantallas de
// leads se leyeran como una página en blanco. Da color de marca, jerarquía
// tipográfica y —lo más importante— pone los números clave arriba, donde el
// gerente los busca primero.
//
// Es un componente server (sin "use client"): se renderiza con los datos que
// ya trae la page, sin round-trip extra.
// ============================================================================

export type HeaderStat = {
  label: string;
  value: string | number;
  hint?: string;
  /** Si viene, el chip es un link (ej. "12 sin asignar" → pantalla de asignación). */
  href?: string;
  tone?: "default" | "accent" | "warning" | "danger" | "success";
};

const TONE_CLS: Record<NonNullable<HeaderStat["tone"]>, string> = {
  default: "border-border bg-card",
  accent: "border-accent/30 bg-accent/5",
  warning: "border-warning/40 bg-warning/5",
  danger: "border-destructive/40 bg-destructive/5",
  success: "border-success/40 bg-success/5",
};

const VALUE_CLS: Record<NonNullable<HeaderStat["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-accent",
  warning: "text-warning-text",
  danger: "text-destructive",
  success: "text-success",
};

export function LeadsPageHeader({
  title,
  description,
  icon: Icon,
  stats = [],
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  stats?: HeaderStat[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // El gradiente arranca en el acento y se apaga hacia la derecha: da
        // color sin competir con el contenido de abajo.
        "relative overflow-hidden rounded-xl border bg-gradient-to-br from-accent/10 via-card to-card",
        className,
      )}
    >
      {/* Filete de acento a la izquierda: ancla visual de la sección. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent to-accent/30"
      />

      <div className="flex flex-col gap-4 p-5 pl-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-5" />
              </span>
            )}
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {description && (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {stats.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <StatChip key={s.label} stat={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Placeholder del header mientras se resuelven los contadores. Reserva la misma
 * altura que el header real para que la página no salte al hidratar.
 */
export function LeadsPageHeaderSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-accent/10 via-card to-card">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent to-accent/30"
      />
      <div className="flex flex-col gap-4 p-5 pl-6">
        <div className="flex items-center gap-3">
          <div className="size-10 animate-pulse rounded-lg bg-muted" />
          <div className="flex flex-col gap-2">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatChip({ stat }: { stat: HeaderStat }) {
  const tone = stat.tone ?? "default";
  const inner = (
    <>
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {stat.label}
      </span>
      <span
        className={cn(
          "text-2xl leading-none font-bold tracking-tight",
          VALUE_CLS[tone],
        )}
      >
        {typeof stat.value === "number"
          ? stat.value.toLocaleString("es-AR")
          : stat.value}
      </span>
      {stat.hint && (
        <span className="text-[11px] text-muted-foreground">{stat.hint}</span>
      )}
    </>
  );

  const cls = cn(
    "flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors",
    TONE_CLS[tone],
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className={cn(cls, "hover:border-accent/50")}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

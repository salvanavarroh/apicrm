import { AlertTriangle, Inbox, MessageSquare, Timer } from "lucide-react";
import Link from "next/link";

import { PresenceToggle } from "@/components/inbox/presence-toggle";
import { Card } from "@/components/ui/card";
import type { InboxPresenceStats } from "@/lib/messaging/presence";
import { cn } from "@/lib/utils";

// ============================================================================
// Bloque de "Recepción de conversaciones" del inicio del vendedor.
//
// Antes era una card con un título, una explicación del round-robin y un toggle.
// El problema es que ese espacio no informaba nada: el vendedor ya sabe qué es
// el reparto automático, lo que no sabe es qué tiene sin responder.
//
// Ahora el mismo bloque lleva los cuatro números que deciden si tiene que
// activarse y qué atender primero, y ocupa el ancho completo.
// ============================================================================

export function ReceptionCard({
  stats,
  inboxHref = "/admin/inbox",
}: {
  stats: InboxPresenceStats;
  inboxHref?: string;
}) {
  const { available, activeCount, open, unanswered, pool, closingWindow } =
    stats;

  return (
    <Card
      className={cn(
        "gap-4 p-4",
        // El borde acompaña el estado: verde cuando está recibiendo, ámbar
        // cuando está inactivo habiendo cola en el pool.
        available
          ? "border-success/40"
          : pool > 0
            ? "border-warning/50"
            : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              available ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Recepción de conversaciones</p>
            <p className="text-xs text-muted-foreground">
              {available
                ? `Estás recibiendo conversaciones nuevas del inbox.${
                    activeCount > 1
                      ? ` Se reparten entre ${activeCount} vendedores activos.`
                      : " Sos el único activo ahora."
                  }`
                : pool > 0
                  ? `Hay ${pool} conversación(es) esperando en el pool. Activate para que te lleguen.`
                  : "Activate para entrar en el reparto automático del inbox."}
            </p>
          </div>
        </div>
        <PresenceToggle
          initialAvailable={available}
          activeCount={activeCount}
        />
      </div>

      <div className="h-px bg-border" aria-hidden />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          icon={AlertTriangle}
          label="Sin responder"
          value={unanswered}
          hint="Escribieron y no contestaste"
          tone={unanswered > 0 ? "danger" : "muted"}
          href={inboxHref}
        />
        <Kpi
          icon={Timer}
          label="Ventana por cerrar"
          value={closingWindow}
          hint="Menos de 4 h para responder"
          tone={closingWindow > 0 ? "warning" : "muted"}
          href={inboxHref}
        />
        <Kpi
          icon={MessageSquare}
          label="Mis conversaciones"
          value={open}
          hint="Abiertas asignadas a vos"
          tone="default"
          href={inboxHref}
        />
        <Kpi
          icon={Inbox}
          label="En el pool"
          value={pool}
          hint="Sin dueño en la empresa"
          tone={pool > 0 && !available ? "warning" : "muted"}
          href={inboxHref}
        />
      </div>
    </Card>
  );
}

const TONE: Record<string, { box: string; value: string }> = {
  default: { box: "border-border bg-card", value: "text-foreground" },
  muted: { box: "border-border bg-muted/30", value: "text-muted-foreground" },
  warning: {
    box: "border-warning/40 bg-warning/5",
    value: "text-warning-text",
  },
  danger: {
    box: "border-destructive/40 bg-destructive/5",
    value: "text-destructive",
  },
};

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof TONE | string;
  href: string;
}) {
  const t = TONE[tone] ?? TONE.default;
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:border-accent/50",
        t.box,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn("text-2xl leading-none font-bold tabular-nums", t.value)}
      >
        {value.toLocaleString("es-AR")}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </Link>
  );
}

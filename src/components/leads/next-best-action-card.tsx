import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageCircle,
  PhoneCall,
  Sparkles,
  ShoppingBag,
  ThermometerSun,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type {
  NbaKind,
  NbaUrgency,
  NextBestAction,
} from "@/lib/next-best-action";
import { cn } from "@/lib/utils";

// ============================================================================
// Tarjeta de "próxima mejor acción" en el detalle del lead.
//
// Va arriba, antes de las fichas de datos: el vendedor abre el lead para saber
// qué hacer, no para leer el domicilio. Se puede pasar `actions` para enganchar
// los botones que ya existen en cada pantalla (WhatsApp, presupuesto, etc.).
// ============================================================================

const KIND_ICON: Record<NbaKind, LucideIcon> = {
  call: PhoneCall,
  follow_up: MessageCircle,
  quote: FileText,
  visit: CalendarClock,
  task: ClipboardList,
  sale: ShoppingBag,
  qualify: ThermometerSun,
  close: XCircle,
  wait: CheckCircle2,
};

const URGENCY_STYLE: Record<
  NbaUrgency,
  { box: string; chip: string; label: string; icon: string }
> = {
  now: {
    box: "border-destructive/40 bg-destructive/5",
    chip: "bg-destructive text-destructive-foreground",
    label: "Ahora",
    icon: "bg-destructive/10 text-destructive",
  },
  today: {
    box: "border-warning/40 bg-warning/5",
    chip: "bg-warning text-warning-foreground",
    label: "Hoy",
    icon: "bg-warning/15 text-warning-foreground",
  },
  soon: {
    box: "border-accent/30 bg-accent/5",
    chip: "bg-accent text-accent-foreground",
    label: "Pronto",
    icon: "bg-accent/10 text-accent",
  },
  none: {
    box: "border-success/40 bg-success/5",
    chip: "bg-success text-success-foreground",
    label: "Al día",
    icon: "bg-success/10 text-success",
  },
};

export function NextBestActionCard({
  action,
  actions,
  className,
}: {
  action: NextBestAction | null;
  /** Botones de la pantalla (WhatsApp, generar presupuesto, agendar…). */
  actions?: React.ReactNode;
  className?: string;
}) {
  if (!action) return null;

  const Icon = KIND_ICON[action.kind];
  const style = URGENCY_STYLE[action.urgency];

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border p-4",
        style.box,
        className,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          style.icon,
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <Sparkles className="size-3" /> Próxima acción
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
              style.chip,
            )}
          >
            {style.label}
          </span>
        </div>
        <p className="text-base leading-tight font-semibold">{action.title}</p>
        <p className="text-xs text-muted-foreground">{action.reason}</p>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 self-center">
          {actions}
        </div>
      )}
    </div>
  );
}

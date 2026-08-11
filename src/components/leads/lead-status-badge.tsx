import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONE,
  type LeadStatus,
} from "@/lib/leads";
import { cn } from "@/lib/utils";

const TONE_CLS: Record<
  ReturnType<typeof getTone>,
  string
> = {
  // Todos los tonos son pares de token: los `bg-*-100 text-*-700` que había acá
  // no tenían variante dark y el badge quedaba ilegible en tema oscuro.
  info: "bg-info/10 text-info",
  warning: "bg-warning/15 text-warning-text",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

function getTone(status: LeadStatus) {
  return LEAD_STATUS_TONE[status];
}

export function LeadStatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  const tone = getTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLS[tone],
        className,
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

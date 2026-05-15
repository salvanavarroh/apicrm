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
  info: "bg-blue-100 text-blue-700",
  warning: "bg-warning/10 text-warning-foreground",
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

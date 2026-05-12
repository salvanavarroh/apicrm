import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  caption,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1.5 p-4", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-4 text-accent" />}
        {label}
      </div>
      <p className="text-3xl font-bold leading-none tracking-tight">{value}</p>
      {caption && (
        <p className="text-xs text-muted-foreground">{caption}</p>
      )}
    </Card>
  );
}

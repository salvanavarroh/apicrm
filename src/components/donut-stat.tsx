import { cn } from "@/lib/utils";

/**
 * Mini donut chart con etiqueta interior (estilo Figma "Métricas globales").
 * Renderizado puro CSS/SVG, sin librerías.
 */
export function DonutStat({
  total,
  completed,
  pending,
  labelCompleted = "Completos",
  labelPending = "Pendientes",
  className,
}: {
  total: number;
  completed: number;
  pending: number;
  labelCompleted?: string;
  labelPending?: string;
  className?: string;
}) {
  const pctCompleted = total > 0 ? Math.round((completed / total) * 100) : 0;
  const pctPending = total > 0 ? Math.round((pending / total) * 100) : 0;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashCompleted = (pctCompleted / 100) * circumference;

  return (
    <div className={cn("flex items-center gap-6", className)}>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-success" />
          <span className="text-muted-foreground">{labelCompleted}</span>
          <span className="ml-auto font-medium">{completed}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-muted-foreground/40" />
          <span className="text-muted-foreground">{labelPending}</span>
          <span className="ml-auto font-medium">{pending}</span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          className="size-28 -rotate-90"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-muted-foreground/20"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            className="text-success"
            strokeDasharray={`${dashCompleted} ${circumference - dashCompleted}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs">
          <span className="font-semibold">{pctCompleted}%</span>
          <span className="text-muted-foreground">{pctPending}%</span>
        </div>
      </div>
    </div>
  );
}

import { TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatARS } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/leads";
import type { ForecastResult } from "@/lib/forecast";

const CONFIDENCE_META = {
  low: { label: "Confianza baja", cls: "bg-amber-100 text-amber-700" },
  medium: { label: "Confianza media", cls: "bg-blue-100 text-blue-700" },
  high: { label: "Confianza alta", cls: "bg-emerald-100 text-emerald-700" },
} as const;

/**
 * Predicción de cierres del pipeline abierto. Determinística: tasa de cierre
 * histórica × multiplicador por etapa × ticket promedio. Ver `lib/forecast.ts`.
 */
export function ForecastCard({
  forecast,
  title = "Predicción de cierres",
}: {
  forecast: ForecastResult;
  title?: string;
}) {
  const conf = CONFIDENCE_META[forecast.confidence];
  const hasPipeline = forecast.byStage.some((s) => s.count > 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4 text-accent" /> {title}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.cls}`}
          title={`Calibrado con ${forecast.sampleSize} venta(s) de los últimos 90 días`}
        >
          {conf.label}
        </span>
      </div>

      {forecast.sampleSize === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Todavía no hay ventas cerradas para calibrar la predicción. Aparecerá
          cuando se registren las primeras ventas.
        </p>
      ) : !hasPipeline ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No hay leads abiertos en el pipeline para proyectar.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Cierres esperados"
              value={forecast.expectedCloses.toFixed(1)}
              hint={`Ticket prom. ${formatARS(forecast.avgTicket)}`}
            />
            <Metric
              label="Ingreso proyectado"
              value={formatARS(forecast.projectedRevenue)}
              hint={`Cierre hist. ${(forecast.baseCloseRate * 100).toFixed(0)}%`}
            />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            {forecast.byStage
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.status}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">
                    {LEAD_STATUS_LABELS[s.status]}
                    <span className="ml-1 text-muted-foreground/60">
                      ({s.count} × {(s.prob * 100).toFixed(0)}%)
                    </span>
                  </span>
                  <span className="font-mono font-medium">
                    {s.expectedCloses.toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

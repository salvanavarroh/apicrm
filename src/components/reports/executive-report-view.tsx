import {
  AlertTriangle,
  BarChart3,
  Clock,
  Filter,
  Info,
  Lightbulb,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { Card } from "@/components/ui/card";
import { formatARS } from "@/lib/format";
import type { ExecutiveReport } from "@/lib/executive-report";
import { cn } from "@/lib/utils";

// ============================================================================
// Vista del informe ejecutivo. Es un componente server: recibe el reporte ya
// calculado y sólo lo dibuja (el cálculo vive en lib/executive-report.ts).
//
// Orden deliberado: primero lo que hay que hacer (alertas + recomendaciones),
// después los números que lo justifican. Un gerente que abre esto entre dos
// reuniones tiene que poder cerrarlo a los 30 segundos sabiendo qué accionar.
// ============================================================================

const pct = (n: number) => `${Math.round(n * 100)}%`;

const SEVERITY_CLS = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-warning/40 bg-warning/5",
  low: "border-border bg-muted/30",
} as const;

const SEVERITY_LABEL = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
} as const;

const IMPACT_CLS = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning-foreground",
  low: "bg-muted text-muted-foreground",
} as const;

const IMPACT_LABEL = {
  high: "Alto impacto",
  medium: "Impacto medio",
  low: "Impacto bajo",
} as const;

export function ExecutiveReportView({ data }: { data: ExecutiveReport }) {
  const { totals } = data;

  return (
    <div className="flex flex-col gap-6">
      {data.capped && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          El período tiene más leads que el tope de carga: los totales generales
          son exactos, pero los desgloses por vendedor y canal son sobre una
          muestra. Acotá el rango de fechas para un número exacto.
        </p>
      )}

      {/* --- Números generales ------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Leads del período"
          value={totals.leads}
          caption={`${totals.active} activos`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas aprobadas"
          value={totals.salesAccepted}
          caption={formatARS(totals.revenue)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversión"
          value={pct(totals.conversion)}
          caption={
            totals.avgTicket > 0
              ? `Ticket prom. ${formatARS(totals.avgTicket)}`
              : "Sin ventas en el período"
          }
        />
        <KpiCard
          icon={Clock}
          label="Primer contacto"
          value={
            totals.avgFirstResponseHours !== null
              ? `${totals.avgFirstResponseHours} h`
              : "s/d"
          }
          caption="Promedio desde la asignación"
        />
      </div>

      {/* --- Alertas ----------------------------------------------------- */}
      <Section
        icon={AlertTriangle}
        title="Alertas"
        subtitle="Leads que se están enfriando por falta de gestión"
      >
        {data.alerts.length === 0 ? (
          <Card className="p-5 text-center text-sm text-muted-foreground">
            Sin alertas en este período. Todos los leads activos están
            gestionados. 🎉
          </Card>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {data.alerts.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-3 py-2.5",
                  SEVERITY_CLS[a.severity],
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    {SEVERITY_LABEL[a.severity]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{a.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- Recomendaciones --------------------------------------------- */}
      <Section
        icon={Lightbulb}
        title="Recomendaciones"
        subtitle="Reglas sobre los datos del período, no opiniones"
      >
        {data.recommendations.length === 0 ? (
          <Card className="p-5 text-center text-sm text-muted-foreground">
            No hay nada que corregir con los datos de este período.
          </Card>
        ) : (
          <ol className="flex flex-col gap-2">
            {data.recommendations.map((r, i) => (
              <li
                key={r.id}
                className="flex gap-3 rounded-lg border bg-card px-3 py-3"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        IMPACT_CLS[r.impact],
                      )}
                    >
                      {IMPACT_LABEL[r.impact]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* --- Desempeño por vendedor -------------------------------------- */}
      <Section
        icon={Users}
        title="Desempeño por vendedor"
        subtitle="Ordenado por ventas aprobadas"
      >
        <Card className="p-0">
          {data.vendors.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No hay vendedores en este alcance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/60 text-[11px] tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Vendedor</th>
                    <th className="px-3 py-2.5 text-right">Leads</th>
                    <th className="px-3 py-2.5 text-right">Contact.</th>
                    <th className="px-3 py-2.5 text-right">Presup.</th>
                    <th className="px-3 py-2.5 text-right">Ventas</th>
                    <th className="px-3 py-2.5 text-right">Conv.</th>
                    <th className="px-3 py-2.5 text-right">Facturación</th>
                    <th className="px-3 py-2.5 text-right">1er contacto</th>
                    <th className="px-4 py-2.5 text-right">Sin gestión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">
                        {v.name}
                        {!v.active && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {v.leads}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {v.contacted}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {v.quoted}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                        {v.salesAccepted}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct(v.conversion)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {v.revenue > 0 ? formatARS(v.revenue) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {v.avgFirstResponseHours !== null
                          ? `${v.avgFirstResponseHours} h`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            v.stale > 0
                              ? "font-semibold text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {v.stale}
                        </span>
                        {v.neverContacted > 0 && (
                          <span className="block text-[10px] text-warning-foreground">
                            {v.neverContacted} sin contactar
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {/* --- Embudo + canales -------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Filter} title="Embudo de conversión">
          <Card className="flex flex-col gap-3 p-5">
            {data.funnel.map((f, i) => {
              const prev = i > 0 ? data.funnel[i - 1] : null;
              const drop =
                prev && prev.count > 0 ? 1 - f.count / prev.count : null;
              return (
                <div key={f.status} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">
                        {f.count.toLocaleString("es-AR")}
                      </span>{" "}
                      · {pct(f.share)}
                      {drop !== null && drop > 0 && (
                        <span className="ml-2 text-destructive">
                          −{pct(drop)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(1.5, f.share * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>

        <Section icon={BarChart3} title="Canales de origen">
          <Card className="p-0">
            {data.channels.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Todavía no hay leads en el período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/60 text-[11px] tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Canal</th>
                      <th className="px-3 py-2.5 text-right">Leads</th>
                      <th className="px-3 py-2.5 text-right">Part.</th>
                      <th className="px-4 py-2.5 text-right">Conversión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((c) => (
                      <tr key={c.key} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{c.label}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {c.leads}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {pct(c.share)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {pct(c.conversion)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Section>
      </div>

      {/* --- Calificación ------------------------------------------------ */}
      <Section
        icon={TrendingUp}
        title="Calificación del pipeline"
        subtitle="Temperatura asignada por los vendedores"
      >
        <div className="grid gap-3 sm:grid-cols-4">
          {data.temperature.map((t) => (
            <Card key={t.key} className="flex flex-col gap-1 p-4">
              <span className="text-xs font-medium text-muted-foreground">
                {t.label}
              </span>
              <span className="text-2xl font-bold tracking-tight">
                {t.count.toLocaleString("es-AR")}
              </span>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-accent" />
          {title}
        </h2>
        {subtitle && (
          <p className="pl-6 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

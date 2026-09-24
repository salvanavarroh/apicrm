"use client";

import {
  AlertTriangle,
  CircleCheck,
  Download,
  FileText,
  Handshake,
  Hourglass,
  Info,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReportData, ReportKpi } from "@/lib/reports/loaders";
import { cn } from "@/lib/utils";

// Vista genérica de un reporte del catálogo: KPIs → serie → distribución →
// tablas. Todos los reportes comparten esta pantalla; lo que cambia es el
// contenido que devuelve su loader.

const PIE_COLORS = [
  "#FF5906",
  "#6851FC",
  "#0EA5E9",
  "#22C55E",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
  "#94A3B8",
];

const FUNNEL_ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  UserRound,
  Users,
  Handshake,
  FileText,
  Hourglass,
  CircleCheck,
};

// La rampa del embudo. El primero es la etapa donde el proceso NO avanzó, así
// que arranca en gris —es el problema, no un paso más— y de ahí sube hacia el
// naranja de la marca a medida que el lead progresa. El color dice avance; no
// es decoración.
const FUNNEL_BANDS = [
  "bg-slate-500",
  "bg-sky-600",
  "bg-teal-600",
  "bg-emerald-600",
  "bg-lime-600",
  "bg-amber-500",
  "bg-accent",
];

const TONE: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning-text",
  danger: "text-destructive",
};

export function ReportView({
  data,
  title,
  fileName,
}: {
  data: ReportData;
  title: string;
  fileName: string;
}) {
  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.kpis.map((k) => ({
          Métrica: k.label,
          Valor: k.value,
          Detalle: k.hint ?? "",
        })),
      ),
      "Resumen",
    );
    if (data.funnel) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.funnel.steps.map((s) => ({
            Etapa: s.label,
            "En esta etapa": s.value,
            "Llegaron hasta acá": s.reached,
            Detalle: s.hint ?? "",
          })),
        ),
        "Embudo",
      );
    }
    if (data.series) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.series.points.map((p) => ({
            Período: p.label,
            Valor: p.value,
          })),
        ),
        "Evolución",
      );
    }
    if (data.breakdown) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.breakdown.points.map((p) => ({
            Categoría: p.label,
            Valor: p.value,
          })),
        ),
        "Distribución",
      );
    }
    for (const t of data.tables) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          t.rows.map((r) =>
            Object.fromEntries(
              t.columns.map((c) => [c.label, r[c.key] ?? ""]),
            ),
          ),
        ),
        t.title.slice(0, 30),
      );
    }
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  return (
    <div className="flex flex-col gap-5">
      {data.capped && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning-text">
          <Info className="mt-0.5 size-4 shrink-0" />
          El período tiene más filas que el tope de carga: los números son sobre
          una muestra. Acotá el rango para un valor exacto.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="mr-2 size-4" /> Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.kpis.map((k) => (
          <Kpi key={k.label} kpi={k} />
        ))}
      </div>

      {/* Embudo */}
      {data.funnel && data.funnel.steps.length > 0 && (
        <Card className="gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Embudo de ventas</h3>
            <p className="text-xs text-muted-foreground">
              {data.funnel.title}
            </p>
          </div>

          {(() => {
            const steps = data.funnel!.steps;
            const total = steps.reduce((a, st) => a + st.value, 0) || 1;
            // El ancho de cada banda es ORDINAL, no proporcional: baja parejo
            // del 100% al 46%. Si fuera proporcional al valor, una etapa con el
            // 0,4% sería una línea invisible y el gráfico dejaría de leerse
            // justo donde hay que mirar. La magnitud la dan los números.
            const widthAt = (i: number) =>
              100 - (100 - 46) * (i / steps.length);
            return (
              <ol className="flex flex-col gap-1">
                {steps.map((step, i) => {
                  const wTop = widthAt(i);
                  const wBot = widthAt(i + 1);
                  const Icon = FUNNEL_ICONS[step.icon ?? ""] ?? Users;
                  const share = step.value / total;
                  return (
                    <li key={step.label} className="flex items-stretch gap-3">
                      <div className="relative min-w-0 flex-1">
                        <div
                          className={cn(
                            "flex min-h-16 items-center gap-3 px-6 text-white",
                            FUNNEL_BANDS[i % FUNNEL_BANDS.length],
                          )}
                          style={{
                            clipPath: `polygon(${(100 - wTop) / 2}% 0%, ${100 - (100 - wTop) / 2}% 0%, ${100 - (100 - wBot) / 2}% 100%, ${(100 - wBot) / 2}% 100%)`,
                          }}
                        >
                          <span
                            className="ml-[var(--inset)] flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15"
                            style={
                              {
                                "--inset": `${(100 - wTop) / 2}%`,
                              } as React.CSSProperties
                            }
                          >
                            <Icon className="size-4.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">
                              {step.label}
                            </span>
                            <span className="block truncate text-[11px] text-white/75">
                              {step.hint}
                            </span>
                          </span>
                          <span
                            className="mr-[var(--inset)] shrink-0 font-mono text-lg font-bold tabular-nums"
                            style={
                              {
                                "--inset": `${(100 - wBot) / 2}%`,
                              } as React.CSSProperties
                            }
                          >
                            {new Intl.NumberFormat("es-AR").format(step.value)}
                          </span>
                        </div>
                      </div>
                      {/* El % va FUERA del trapecio: adentro lo recortaría el
                          clip-path en las bandas angostas. */}
                      <span className="flex w-16 shrink-0 items-center justify-end text-sm font-medium tabular-nums text-muted-foreground">
                        {step.value === 0
                          ? "—"
                          : share < 0.001
                            ? "<0,1%"
                            : `${(share * 100).toFixed(share < 0.1 ? 1 : 0).replace(".", ",")}%`}
                      </span>
                    </li>
                  );
                })}
              </ol>
            );
          })()}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            {(() => {
              const steps = data.funnel!.steps;
              const total = steps.reduce((a, st) => a + st.value, 0);
              const last = steps[steps.length - 1];
              if (!total) return "Sin leads en el período.";
              return (
                <>
                  De{" "}
                  <span className="font-semibold text-foreground">
                    {new Intl.NumberFormat("es-AR").format(total)}
                  </span>{" "}
                  leads del período, sólo el{" "}
                  <span className="font-semibold text-foreground">
                    {((last.value / total) * 100)
                      .toFixed(1)
                      .replace(".", ",")}
                    %
                  </span>{" "}
                  llega a {last.label.toLowerCase()}.
                </>
              );
            })()}
          </p>
        </Card>
      )}

      {/* Gráficos */}
      {(data.series || data.breakdown) && (
        <div
          className={cn(
            "grid gap-4",
            data.series && data.breakdown ? "lg:grid-cols-[3fr_2fr]" : "",
          )}
        >
          {data.series && data.series.points.length > 0 && (
            <Card className="gap-3 p-5">
              <h3 className="text-sm font-semibold">{data.series.title}</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.points}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} width={70} />
                    <Tooltip
                      formatter={(v) =>
                        new Intl.NumberFormat("es-AR").format(Number(v) || 0)
                      }
                    />
                    <Bar dataKey="value" fill="#FF5906" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {data.breakdown && data.breakdown.points.length > 0 && (
            <Card className="gap-3 p-5">
              <h3 className="text-sm font-semibold">{data.breakdown.title}</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.breakdown.points}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {data.breakdown.points.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {data.breakdown.points.slice(0, 8).map((p, i) => (
                  <li
                    key={p.label}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {p.label}
                    <span className="font-mono text-foreground">{p.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* Tablas */}
      {data.tables.map((t) => (
        <Card key={t.title} className="p-0">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold">{t.title}</h3>
          </div>
          {t.rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sin datos en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/60 text-[11px] tracking-wide text-muted-foreground uppercase">
                  <tr>
                    {t.columns.map((c) => (
                      <th
                        key={c.key}
                        className={cn(
                          "px-4 py-2.5",
                          c.align === "right" ? "text-right" : "text-left",
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {t.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-4 py-2.5",
                            c.align === "right"
                              ? "text-right font-mono tabular-nums"
                              : "font-medium",
                          )}
                        >
                          {r[c.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Kpi({ kpi }: { kpi: ReportKpi }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="text-xs font-medium text-muted-foreground">
        {kpi.label}
      </span>
      <span
        className={cn(
          "text-2xl leading-none font-bold tracking-tight",
          TONE[kpi.tone ?? "default"],
        )}
      >
        {kpi.value}
      </span>
      {kpi.hint && (
        <span className="text-xs text-muted-foreground">{kpi.hint}</span>
      )}
    </Card>
  );
}

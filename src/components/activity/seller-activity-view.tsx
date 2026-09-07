"use client";

import { Download } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatClock, formatMinutes } from "@/lib/activity";
import type { SellerActivity } from "@/lib/team-activity";
import { cn } from "@/lib/utils";

function clockFromMinutes(m: number | null): string {
  if (m === null) return "—";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const DAY_FMT = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

export function SellerActivityView({ data }: { data: SellerActivity }) {
  const { row } = data;
  const maxHour = Math.max(1, ...data.byHour);
  const maxSection = Math.max(1, ...data.bySection.map((p) => p.value));

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.days.map((d) => ({
          Día: d.day,
          "Tiempo en el CRM": formatMinutes(d.minutes),
          Minutos: d.minutes,
          Entró: d.firstAt ? formatClock(d.firstAt, data.tz) : "",
          "Última actividad": d.lastAt ? formatClock(d.lastAt, data.tz) : "",
          Contactos: d.contacts,
          "Tareas hechas": d.tasksDone,
          Visitas: d.visits,
        })),
      ),
      "Día por día",
    );
    XLSX.writeFile(
      wb,
      `actividad-${row.name.replace(/\s+/g, "-").toLowerCase()}-${data.from}-a-${data.to}.xlsx`,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Período {data.from} → {data.to}
        </h2>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="mr-2 size-4" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tiempo en el CRM" value={formatMinutes(row.minutes)} />
        <Kpi
          label="Días con actividad"
          value={String(row.activeDays)}
          hint={
            row.avgMinutesPerDay
              ? `${formatMinutes(row.avgMinutesPerDay)} por día`
              : undefined
          }
        />
        <Kpi
          label="Arranque promedio"
          value={clockFromMinutes(row.startAvgMinutes)}
          hint="Primer movimiento del día"
        />
        <Kpi
          label="Gestiones por hora"
          value={row.actionsPerHour !== null ? String(row.actionsPerHour) : "s/d"}
          hint={`${row.contacts} contactos · ${row.messages} mensajes`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <div>
            <h3 className="text-sm font-semibold">Horario real</h3>
            <p className="text-xs text-muted-foreground">
              A qué hora estuvo en el CRM, sumando todo el período.
            </p>
          </div>
          <div className="flex h-40 items-end gap-[3px]">
            {data.byHour.map((minutes, hour) => (
              <div
                key={hour}
                className="group relative flex flex-1 flex-col justify-end"
                title={`${String(hour).padStart(2, "0")}:00 — ${formatMinutes(minutes)}`}
              >
                <div
                  className={cn(
                    "w-full rounded-t-sm",
                    minutes > 0 ? "bg-accent" : "bg-muted",
                  )}
                  style={{
                    height: minutes > 0 ? `${(minutes / maxHour) * 100}%` : "2px",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </Card>

        <Card className="gap-3 p-5">
          <h3 className="text-sm font-semibold">Dónde pasó el tiempo</h3>
          {data.bySection.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sin tiempo registrado en este período.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.bySection.map((p) => (
                <li key={p.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{p.label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {formatMinutes(p.value)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(p.value / maxSection) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Día por día</h3>
        </div>
        {data.days.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No hay actividad registrada en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Día</th>
                  <th className="px-4 py-2.5 text-right">En el CRM</th>
                  <th className="px-4 py-2.5 text-right">Entró</th>
                  <th className="px-4 py-2.5 text-right">Últ. actividad</th>
                  <th className="px-4 py-2.5 text-right">Contactos</th>
                  <th className="px-4 py-2.5 text-right">Tareas</th>
                  <th className="px-4 py-2.5 text-right">Visitas</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => {
                  const num = "px-4 py-2.5 text-right font-mono tabular-nums";
                  const empty = d.minutes === 0;
                  return (
                    <tr
                      key={d.day}
                      className={cn(
                        "border-b last:border-0",
                        empty && "text-muted-foreground",
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {DAY_FMT.format(new Date(`${d.day}T12:00:00Z`))}
                      </td>
                      <td className={num}>
                        {empty ? "sin entrar" : formatMinutes(d.minutes)}
                      </td>
                      <td className={num}>
                        {d.firstAt ? formatClock(d.firstAt, data.tz) : "—"}
                      </td>
                      <td className={num}>
                        {d.lastAt ? formatClock(d.lastAt, data.tz) : "—"}
                      </td>
                      <td className={num}>{d.contacts || "—"}</td>
                      <td className={num}>{d.tasksDone || "—"}</td>
                      <td className={num}>{d.visits || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold leading-none tracking-tight">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

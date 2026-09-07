"use client";

import { Download, Info } from "lucide-react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatClock, formatMinutes } from "@/lib/activity";
import type { TeamActivity, TeamActivityRow } from "@/lib/team-activity";
import { cn } from "@/lib/utils";

const int = (n: number) => new Intl.NumberFormat("es-AR").format(n || 0);

/** "09:40" a partir de minutos desde medianoche. */
function clockFromMinutes(m: number | null): string {
  if (m === null) return "—";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function TeamActivityView({
  data,
  basePath,
}: {
  data: TeamActivity;
  /** Ruta de la sección en el rol actual, para el link al detalle. */
  basePath: string;
}) {
  const { totals } = data;

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.rows.map((r) => ({
          Vendedor: r.name,
          Sucursal: r.branch ?? "",
          Estado: r.active ? "Activo" : "Inactivo",
          "Tiempo en el CRM": formatMinutes(r.minutes),
          Minutos: r.minutes,
          "Días activos": r.activeDays,
          "Promedio por día": formatMinutes(r.avgMinutesPerDay),
          "Arranque promedio": clockFromMinutes(r.startAvgMinutes),
          "Última actividad": r.lastSeenAt
            ? formatClock(r.lastSeenAt, data.tz)
            : "",
          "Leads recibidos": r.leadsReceived,
          "Leads gestionados": r.leadsManaged,
          Contactos: r.contacts,
          "Mensajes enviados": r.messages,
          "Tareas hechas": r.tasksDone,
          "Tareas vencidas": r.tasksOverdue,
          "Visitas concretadas": r.visitsDone,
          "Visitas agendadas": r.visitsPending,
          Ventas: r.sales,
          "Gestiones por hora": r.actionsPerHour ?? "",
        })),
      ),
      "Equipo",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byDay.map((p) => ({ Día: p.label, Horas: p.value })),
      ),
      "Por día",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.bySection.map((p) => ({
          Sección: p.label,
          Tiempo: formatMinutes(p.value),
          Minutos: p.value,
        })),
      ),
      "Por sección",
    );
    XLSX.writeFile(wb, `actividad-${data.from}-a-${data.to}.xlsx`);
  }

  const maxSection = Math.max(1, ...data.bySection.map((p) => p.value));

  return (
    <div className="flex flex-col gap-5">
      {data.capped && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning-text">
          <Info className="mt-0.5 size-4 shrink-0" />
          El período tiene más movimientos que el tope de carga: las gestiones
          son sobre una muestra. El tiempo sí es exacto.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Período {data.from} → {data.to}
        </h2>
        <Button variant="outline" size="sm" onClick={exportExcel}>
          <Download className="mr-2 size-4" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Tiempo del equipo en el CRM"
          value={formatMinutes(totals.minutes)}
          hint={`${totals.peopleWithTime} de ${totals.people} vendedores con actividad`}
        />
        <Kpi
          label="Promedio por vendedor y día"
          value={formatMinutes(totals.avgMinutesPerPersonDay)}
          hint="Sobre los días en que efectivamente entró"
        />
        <Kpi
          label="Gestiones por hora conectada"
          value={totals.actionsPerHour !== null ? String(totals.actionsPerHour) : "s/d"}
          hint="Contactos + mensajes + tareas + visitas"
        />
        <Kpi
          label="Tareas vencidas"
          value={int(totals.tasksOverdue)}
          tone={totals.tasksOverdue > 0 ? "danger" : "default"}
          hint="Sin completar y con fecha pasada"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="gap-3 p-5">
          <h3 className="text-sm font-semibold">Horas del equipo por día</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDay}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} interval="preserveStartEnd" />
                <YAxis fontSize={11} tickLine={false} width={40} unit=" h" />
                <Tooltip formatter={(v) => `${v} h`} />
                <Bar dataKey="value" fill="#FF5906" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="gap-3 p-5">
          <h3 className="text-sm font-semibold">Dónde pasan el tiempo</h3>
          {data.bySection.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay tiempo registrado en este período.
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
          <h3 className="text-sm font-semibold">Vendedor por vendedor</h3>
          <p className="text-xs text-muted-foreground">
            Tocá un vendedor para ver su día a día y su horario real.
          </p>
        </div>
        {data.rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No hay vendedores en tu equipo todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Vendedor</th>
                  <th className="px-4 py-2.5 text-right">En el CRM</th>
                  <th className="px-4 py-2.5 text-right">Días</th>
                  <th className="px-4 py-2.5 text-right">Prom./día</th>
                  <th className="px-4 py-2.5 text-right">Arranca</th>
                  <th className="px-4 py-2.5 text-right">Leads</th>
                  <th className="px-4 py-2.5 text-right">Gestionados</th>
                  <th className="px-4 py-2.5 text-right">Contactos</th>
                  <th className="px-4 py-2.5 text-right">Mensajes</th>
                  <th className="px-4 py-2.5 text-right">Tareas</th>
                  <th className="px-4 py-2.5 text-right">Vencidas</th>
                  <th className="px-4 py-2.5 text-right">Visitas</th>
                  <th className="px-4 py-2.5 text-right">Ventas</th>
                  <th className="px-4 py-2.5 text-right">Gest./h</th>
                </tr>
              </thead>
              <tbody>
                {[...data.rows]
                  .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
                  .map((r) => (
                    <Row key={r.id} row={r} basePath={basePath} tz={data.tz} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          El tiempo cuenta los minutos con el CRM en pantalla y con el vendedor
          usándolo: una pestaña abierta y olvidada no suma. No es un reloj de
          fichada —el trabajo en el salón, al teléfono o en la calle no pasa por
          acá—, sirve para comparar entre vendedores y contra lo que produjeron.
        </span>
      </p>
    </div>
  );
}

function Row({
  row,
  basePath,
  tz,
}: {
  row: TeamActivityRow;
  basePath: string;
  tz: string;
}) {
  const num = "px-4 py-2.5 text-right font-mono tabular-nums";
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-4 py-2.5">
        <Link href={`${basePath}/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
        <div className="text-[11px] text-muted-foreground">
          {row.branch ?? "Sin sucursal"}
          {!row.active && " · inactivo"}
          {row.lastSeenAt && ` · visto ${formatClock(row.lastSeenAt, tz)}`}
        </div>
      </td>
      <td className={cn(num, row.minutes === 0 && "text-muted-foreground")}>
        {formatMinutes(row.minutes)}
      </td>
      <td className={num}>{row.activeDays || "—"}</td>
      <td className={num}>
        {row.avgMinutesPerDay ? formatMinutes(row.avgMinutesPerDay) : "—"}
      </td>
      <td className={num}>{clockFromMinutes(row.startAvgMinutes)}</td>
      <td className={num}>{row.leadsReceived || "—"}</td>
      <td className={num}>{row.leadsManaged || "—"}</td>
      <td className={num}>{row.contacts || "—"}</td>
      <td className={num}>{row.messages || "—"}</td>
      <td className={num}>{row.tasksDone || "—"}</td>
      <td className={cn(num, row.tasksOverdue > 0 && "font-bold text-destructive")}>
        {row.tasksOverdue || "—"}
      </td>
      <td className={num}>{row.visitsDone || "—"}</td>
      <td className={num}>{row.sales || "—"}</td>
      <td className={num}>{row.actionsPerHour ?? "—"}</td>
    </tr>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-bold leading-none tracking-tight",
          tone === "danger" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

"use client";

import { Download, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import * as XLSX from "xlsx";

import { DateField } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import type { ExecutiveReport } from "@/lib/executive-report";
import { cn } from "@/lib/utils";

// ============================================================================
// Barra del informe ejecutivo: rango de fechas (con atajos) + export a Excel.
//
// Los atajos son la mitad del valor del reporte: lo que el cliente contó que le
// falta en los sistemas de la competencia es justamente poder mirar "el fin de
// semana" o "el mes pasado" sin pedirle un desarrollo a nadie.
// ============================================================================

const pct = (n: number) => `${Math.round(n * 100)}%`;

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Preset = { label: string; compute: () => { from: string; to: string } };

const PRESETS: Preset[] = [
  {
    label: "Últimas 24 h",
    compute: () => {
      // El rango de fechas del informe es por día, así que "últimas 24 h" se
      // resuelve como ayer→hoy: cubre la guardia nocturna, que es cuando entra
      // buena parte de los leads.
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86_400_000);
      return { from: toKey(yesterday), to: toKey(now) };
    },
  },
  {
    label: "Hoy",
    compute: () => {
      const now = new Date();
      return { from: toKey(now), to: toKey(now) };
    },
  },
  {
    label: "Este mes",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toKey(start), to: toKey(now) };
    },
  },
  {
    label: "Mes pasado",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toKey(start), to: toKey(end) };
    },
  },
  {
    label: "Últimos 30 días",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 86_400_000);
      return { from: toKey(start), to: toKey(now) };
    },
  },
  {
    label: "Últimos 90 días",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getTime() - 90 * 86_400_000);
      return { from: toKey(start), to: toKey(now) };
    },
  },
  {
    label: "Fin de semana pasado",
    compute: () => {
      // Sábado y domingo más recientes ya terminados.
      const now = new Date();
      const day = now.getDay(); // 0 = domingo
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - (day === 0 ? 7 : day));
      const lastSaturday = new Date(lastSunday);
      lastSaturday.setDate(lastSunday.getDate() - 1);
      return { from: toKey(lastSaturday), to: toKey(lastSunday) };
    },
  },
];

export function ReportToolbar({
  basePath,
  from,
  to,
  data,
}: {
  /** Ruta de la pantalla (cambia según el rol: /admin/reports, /manager/reports). */
  basePath: string;
  from: string;
  to: string;
  data: ExecutiveReport;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setRange(next: { from?: string; to?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const resumen = [
      { Métrica: "Leads del período", Valor: data.totals.leads },
      { Métrica: "Leads activos", Valor: data.totals.active },
      { Métrica: "Contactados", Valor: data.totals.contacted },
      { Métrica: "Presupuestados", Valor: data.totals.quoted },
      { Métrica: "Ventas aprobadas", Valor: data.totals.salesAccepted },
      { Métrica: "Facturación", Valor: data.totals.revenue },
      { Métrica: "Ticket promedio", Valor: Math.round(data.totals.avgTicket) },
      { Métrica: "Conversión", Valor: pct(data.totals.conversion) },
      {
        Métrica: "Primer contacto (mediana en horas hábiles)",
        Valor: data.totals.firstResponseHours ?? "s/d",
      },
      {
        Métrica: "Primer contacto — leads con contacto registrado",
        Valor: data.totals.firstResponseSample,
      },
      { Métrica: "Horario de atención usado", Valor: data.businessHours },
      { Métrica: "Sin gestión +7 días", Valor: data.totals.stale },
      { Métrica: "Sin asignar", Valor: data.totals.unassigned },
      { Métrica: "Activos sin calificar", Valor: data.totals.noTemperature },
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(resumen),
      "Resumen",
    );

    const vendedores = data.vendors.map((v) => ({
      Vendedor: v.name,
      Estado: v.active ? "Activo" : "Inactivo",
      "Leads asignados": v.leads,
      Contactados: v.contacted,
      Presupuestados: v.quoted,
      "Ventas aprobadas": v.salesAccepted,
      Facturación: v.revenue,
      Conversión: pct(v.conversion),
      "Sin gestión +7d": v.stale,
      "Nunca contactados": v.neverContacted,
      "Primer contacto (h hábiles, mediana)": v.firstResponseHours ?? "s/d",
      "Primer contacto (leads medidos)": v.firstResponseSample,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(vendedores),
      "Vendedores",
    );

    const embudo = data.funnel.map((f) => ({
      Etapa: f.label,
      Leads: f.count,
      "% del total": pct(f.share),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(embudo), "Embudo");

    const canales = data.channels.map((c) => ({
      Canal: c.label,
      Leads: c.leads,
      Participación: pct(c.share),
      Ganados: c.won,
      Conversión: pct(c.conversion),
      Ventas: c.sales,
      Facturación: c.revenue,
      Inversión: c.spend ?? "",
      "Costo por lead": c.costPerLead !== null ? Math.round(c.costPerLead) : "",
      "Costo por venta": c.costPerSale !== null ? Math.round(c.costPerSale) : "",
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(canales),
      "Canales",
    );

    const alertas = data.alerts.map((a) => ({
      Severidad:
        a.severity === "high"
          ? "Alta"
          : a.severity === "medium"
            ? "Media"
            : "Baja",
      Alerta: a.title,
      Detalle: a.detail,
      Cantidad: a.count,
    }));
    if (alertas.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(alertas),
        "Alertas",
      );
    }

    const recomendaciones = data.recommendations.map((r) => ({
      Impacto:
        r.impact === "high" ? "Alto" : r.impact === "medium" ? "Medio" : "Bajo",
      Recomendación: r.title,
      "Qué hacer": r.detail,
    }));
    if (recomendaciones.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(recomendaciones),
        "Recomendaciones",
      );
    }

    const periodo = from || to ? `_${from || "inicio"}_a_${to || "hoy"}` : "";
    XLSX.writeFile(wb, `informe-ejecutivo${periodo}.xlsx`);
  }

  const hasRange = Boolean(from || to);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => {
          const r = p.compute();
          const active = from === r.from && to === r.to;
          return (
            <button
              key={p.label}
              type="button"
              disabled={pending}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={pending}
          onClick={() => setRange({ from: "", to: "" })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
            !hasRange
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
          )}
        >
          Histórico
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <DateField
          label="Desde"
          value={from}
          max={to || undefined}
          onChange={(v) => setRange({ from: v })}
          className="w-[calc(50%-0.375rem)] sm:w-40"
        />
        <DateField
          label="Hasta"
          value={to}
          min={from || undefined}
          onChange={(v) => setRange({ to: v })}
          className="w-[calc(50%-0.375rem)] sm:w-40"
        />
        {hasRange && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRange({ from: "", to: "" })}
            disabled={pending}
          >
            <X className="mr-1 size-3.5" /> Limpiar
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={exportExcel} disabled={pending}>
            <Download className="mr-2 size-4" /> Descargar Excel
          </Button>
        </div>
      </div>
    </div>
  );
}

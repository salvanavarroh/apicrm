"use client";

import { Download, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CrossReports } from "@/lib/cross-reports";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  pending: "Pendiente",
  suspended: "Suspendida",
};

export function ReportsToolbar({
  from,
  to,
  data,
}: {
  from: string;
  to: string;
  data: CrossReports;
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
    startTransition(() => router.push(`/super-admin/reports?${sp.toString()}`));
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const empresas = data.companies.map((c) => ({
      Empresa: c.name,
      Estado: STATUS_LABELS[c.status] ?? c.status,
      Leads: c.leads,
      Conversión: pct(c.conversion),
      Ventas: c.salesCount,
      Facturación: c.revenue,
      "Ticket promedio": Math.round(c.avgTicket),
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(empresas),
      "Empresas",
    );

    const vendedores = data.vendors.map((v, i) => ({
      "#": i + 1,
      Vendedor: v.name,
      Empresa: v.companyName,
      Ventas: v.salesCount,
      Facturación: v.revenue,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(vendedores),
      "Vendedores",
    );

    const canales = data.channels.map((ch) => ({
      Canal: ch.label,
      Leads: ch.leads,
      Participación: pct(ch.share),
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(canales),
      "Canales",
    );

    const salud = data.health.map((h) => ({
      Empresa: h.name,
      Estado: STATUS_LABELS[h.status] ?? h.status,
      "Días sin actividad": h.lastActivityDays ?? "Sin actividad",
      "Pagos vencidos": h.overduePayments,
      "En riesgo": h.atRisk ? "Sí" : "No",
      Motivos: h.reasons.join(" · "),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salud), "Salud");

    const periodo = from || to ? `_${from || "inicio"}_a_${to || "hoy"}` : "";
    XLSX.writeFile(wb, `reporte-api-crm${periodo}.xlsx`);
  }

  const hasRange = Boolean(from || to);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Desde
        </label>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setRange({ from: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Hasta
        </label>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setRange({ to: e.target.value })}
          className="w-40"
        />
      </div>
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
  );
}

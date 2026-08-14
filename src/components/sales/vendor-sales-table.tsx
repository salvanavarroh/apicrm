"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  SalesDateFilter,
  useDateRangeFilter,
} from "@/components/sales/sales-date-filter";
import { Badge } from "@/components/ui/badge";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";

// Tabla de "Mis ventas" del vendedor. Vive en un componente cliente para poder
// filtrar por fecha sin round-trip; los KPIs de arriba se recalculan sobre el
// rango filtrado, que es lo que uno espera al elegir "últimos 30 días".

const STATUS_LABEL = {
  evaluating: "En evaluación",
  accepted: "Aceptada",
  rejected: "Rechazada",
} as const;

const STATUS_VARIANT: Record<
  keyof typeof STATUS_LABEL,
  "default" | "secondary" | "destructive"
> = {
  evaluating: "default",
  accepted: "secondary",
  rejected: "destructive",
};

export type VendorSaleRow = {
  id: string;
  status: keyof typeof STATUS_LABEL;
  final_price: number;
  commission_percent_snapshot: number | null;
  started_at: string;
  resolved_at: string | null;
  lead: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    vehicle_model: string | null;
  } | null;
};

export function VendorSalesTable({ sales }: { sales: VendorSaleRow[] }) {
  const filter = useDateRangeFilter();
  const rows = useMemo(
    () => sales.filter((s) => filter.matches(s.started_at)),
    [sales, filter],
  );

  const accepted = rows.filter((s) => s.status === "accepted");
  const commission = accepted.reduce((acc, s) => {
    const pct = Number(s.commission_percent_snapshot) || 0;
    return acc + Number(s.final_price) * (pct / 100);
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <SalesDateFilter
        filter={filter}
        shown={rows.length}
        total={sales.length}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total ventas" value={String(rows.length)} />
        <Stat label="Aceptadas" value={String(accepted.length)} />
        <Stat label="Comisión acumulada" value={formatARS(commission)} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {filter.hasRange
            ? "No hay ventas en el rango elegido."
            : "Todavía no iniciaste ninguna venta."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Vehículo</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-right">Comisión</th>
                <th className="px-4 py-2 text-left">Inicio</th>
                <th className="px-4 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b bg-card last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium">
                    {s.lead ? (
                      <Link
                        href={`/sales/leads/${s.lead.id}`}
                        className="hover:underline"
                      >
                        {fullName(s.lead.first_name, s.lead.last_name)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.lead?.vehicle_model ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatARS(s.final_price)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {s.commission_percent_snapshot ? (
                      <>
                        {s.commission_percent_snapshot}% ·{" "}
                        <span className="font-mono">
                          {formatARS(
                            Number(s.final_price) *
                              (Number(s.commission_percent_snapshot) / 100),
                          )}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(s.started_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

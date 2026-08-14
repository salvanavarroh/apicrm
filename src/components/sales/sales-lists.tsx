"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  SalesDateFilter,
  useDateRangeFilter,
} from "@/components/sales/sales-date-filter";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";

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

export type SaleListRow = {
  id: string;
  status: keyof typeof STATUS_LABEL;
  final_price: number;
  started_at: string;
  vendor: { first_name: string | null; last_name: string | null } | null;
  lead: { first_name: string | null; last_name: string | null; vehicle_model: string | null } | null;
};

export function SalesLists({
  sales,
  basePath,
}: {
  sales: SaleListRow[];
  basePath: string;
}) {
  const filter = useDateRangeFilter();
  const filtered = useMemo(
    () => sales.filter((s) => filter.matches(s.started_at)),
    [sales, filter],
  );

  const evaluating = filtered.filter((s) => s.status === "evaluating");
  const resolved = filtered.filter((s) => s.status !== "evaluating");

  return (
    <Tabs defaultValue="queue">
      <SalesDateFilter
        filter={filter}
        shown={filtered.length}
        total={sales.length}
        className="mb-4"
      />
      <TabsList>
        <TabsTrigger value="queue">
          En evaluación{" "}
          <span className="ml-2 rounded-full bg-warning/20 px-2 text-[10px] font-semibold text-warning-foreground">
            {evaluating.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="history">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="queue" className="mt-4">
        <SalesTable rows={evaluating} basePath={basePath} cta="Validar" />
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <SalesTable rows={resolved} basePath={basePath} cta="Ver" />
      </TabsContent>
    </Tabs>
  );
}

function SalesTable({
  rows,
  basePath,
  cta,
}: {
  rows: SaleListRow[];
  basePath: string;
  cta: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        Sin ventas en este filtro.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Lead</th>
            <th className="px-4 py-2 text-left">Vendedor</th>
            <th className="px-4 py-2 text-right">Monto</th>
            <th className="px-4 py-2 text-left">Inicio</th>
            <th className="px-4 py-2 text-left">Estado</th>
            <th className="px-4 py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b bg-card last:border-0 hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">
                {s.lead ? (
                  <>
                    <span>{fullName(s.lead.first_name, s.lead.last_name)}</span>
                    {s.lead.vehicle_model && (
                      <span className="block text-xs text-muted-foreground">
                        {s.lead.vehicle_model}
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {s.vendor ? fullName(s.vendor.first_name, s.vendor.last_name) : "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatARS(s.final_price)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(s.started_at).toLocaleDateString("es-AR")}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[s.status]}>
                  {STATUS_LABEL[s.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`${basePath}/${s.id}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {cta}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

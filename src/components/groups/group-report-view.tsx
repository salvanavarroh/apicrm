"use client";

import { ArrowRight, DollarSign, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setActiveCompany } from "@/app/(app)/group/actions";
import { getGroupSpend } from "@/app/(app)/group/spend-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BrandSpend, GroupReport } from "@/lib/group-report";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

function money(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function int(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

export function GroupReportView({ report }: { report: GroupReport }) {
  const [spend, setSpend] = useState<Map<string, BrandSpend> | null>(null);
  const [loadingSpend, startSpend] = useTransition();
  const [switching, startSwitch] = useTransition();
  const router = useRouter();

  function loadSpend() {
    startSpend(async () => {
      const res = await getGroupSpend({ from: report.from, to: report.to });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setSpend(new Map(res.rows.map((r) => [r.companyId, r])));
      if (res.rows.some((r) => r.truncated)) {
        toast.warning(
          "Alguna marca tiene más anuncios de los que se pudieron traer: su inversión está subestimada.",
        );
      }
    });
  }

  function enterBrand(companyId: string) {
    startSwitch(async () => {
      const res = await setActiveCompany(companyId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.push("/admin");
    });
  }

  // Ranking por ventas; con empate, por facturación. Es el orden con el que el
  // dueño del grupo mira: qué marca vende, no qué marca junta leads.
  const ranked = [...report.brands].sort(
    (a, b) => b.sales - a.sales || b.revenue - a.revenue,
  );
  const best = ranked[0];
  const maxRevenue = Math.max(1, ...report.brands.map((b) => b.revenue));

  return (
    <div className="flex flex-col gap-4">
      {/* Totales del grupo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Leads" value={int(report.totals.leads)} caption={`${report.brands.length} marcas`} />
        <Kpi label="Ventas" value={int(report.totals.sales)} caption={`${report.totals.conversion.toFixed(1)}% de conversión`} />
        <Kpi label="Facturación" value={money(report.totals.revenue)} caption="Ventas aceptadas" />
        <Kpi
          label="Equipo"
          value={int(report.totals.vendors)}
          caption={`${report.totals.branches} sucursales`}
        />
      </div>

      {/* Comparativa por marca */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div>
            <h2 className="text-sm font-medium">Marcas del grupo</h2>
            <p className="text-xs text-muted-foreground">
              Ordenadas por ventas. Tocá una marca para entrar a su CRM.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSpend}
            disabled={loadingSpend}
          >
            {loadingSpend ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <DollarSign className="mr-2 size-3.5" />
            )}
            {spend ? "Actualizar inversión" : "Traer inversión de ads"}
          </Button>
        </div>

        {report.brands.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            El grupo todavía no tiene marcas asignadas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Marca</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                  <th className="px-3 py-2 text-right">Contactados</th>
                  <th className="px-3 py-2 text-right">Presup.</th>
                  <th className="px-3 py-2 text-right">Ventas</th>
                  <th className="px-3 py-2 text-right">Conv.</th>
                  <th className="px-3 py-2 text-right">Facturación</th>
                  <th className="px-3 py-2 text-right">Inversión</th>
                  <th className="px-3 py-2 text-right">Costo/lead</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {ranked.map((b, i) => {
                  const s = spend?.get(b.companyId);
                  return (
                    <tr key={b.companyId} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="w-4 text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </span>
                          <span className="font-medium">{b.name}</span>
                          {b.branches > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {b.branches} suc.
                            </span>
                          )}
                        </span>
                        {/* Barra de facturación relativa: el tamaño de cada marca
                            de un vistazo, sin tener que comparar números. */}
                        <span className="mt-1 flex h-1 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                          <span
                            className="h-full bg-accent"
                            style={{ width: `${(b.revenue / maxRevenue) * 100}%` }}
                          />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{int(b.leads)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{int(b.contacted)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{int(b.quoted)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        {int(b.sales)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono",
                          b.conversion === 0 && b.leads > 0 && "text-destructive",
                        )}
                      >
                        {b.conversion.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{money(b.revenue)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {s ? money(s.spend) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {s?.costPerLead != null ? money(s.costPerLead) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={switching}
                          onClick={() => enterBrand(b.companyId)}
                        >
                          Entrar <ArrowRight className="ml-1 size-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 bg-muted/40 font-semibold">
                <tr>
                  <td className="px-4 py-2.5">Total del grupo</td>
                  <td className="px-3 py-2.5 text-right font-mono">{int(report.totals.leads)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{int(report.totals.contacted)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{int(report.totals.quoted)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{int(report.totals.sales)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {report.totals.conversion.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{money(report.totals.revenue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {spend
                      ? money([...spend.values()].reduce((n, s) => n + s.spend, 0))
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {best && best.sales > 0 && (
        <p className="text-xs text-muted-foreground">
          <b className="text-foreground">{best.name}</b> es la marca que más vende
          en el período: {int(best.sales)} venta{best.sales === 1 ? "" : "s"} y{" "}
          {money(best.revenue)} facturados.
        </p>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
    </Card>
  );
}

import {
  AlertTriangle,
  BarChart3,
  Building2,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { loadCrossReports } from "@/lib/cross-reports";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const COMPANY_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  pending: "Pendiente",
  suspended: "Suspendida",
};

export default async function SuperAdminReportsPage() {
  await requireRole(["super_admin"]);
  const data = await loadCrossReports();
  const atRisk = data.health.filter((h) => h.atRisk);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="size-6 text-accent" /> Reportes cruzados
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparativa de performance entre todas las concesionarias de la
          plataforma (histórico).
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Empresas"
          value={data.totals.companies}
          caption={`${atRisk.length} en riesgo`}
        />
        <KpiCard icon={Users} label="Leads totales" value={data.totals.leads} />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas cerradas"
          value={data.totals.sales}
        />
        <KpiCard
          icon={TrendingUp}
          label="Facturación total"
          value={formatARS(data.totals.revenue)}
        />
      </div>

      {/* 1. Ranking de empresas */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Ranking de empresas</h2>
        {data.companies.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left">Empresa</th>
                  <th className="pb-2 text-right">Leads</th>
                  <th className="pb-2 text-right">Conversión</th>
                  <th className="pb-2 text-right">Ventas</th>
                  <th className="pb-2 text-right">Facturación</th>
                  <th className="pb-2 text-right">Ticket prom.</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      {c.name}
                      {c.status !== "active" && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {COMPANY_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{c.leads}</td>
                    <td className="py-2 text-right font-mono">
                      {pct(c.conversion)}
                    </td>
                    <td className="py-2 text-right font-mono">{c.salesCount}</td>
                    <td className="py-2 text-right font-mono">
                      {formatARS(c.revenue)}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {c.avgTicket > 0 ? formatARS(c.avgTicket) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. Salud de cuenta */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-amber-500" /> Salud de cuenta
          </h2>
          {atRisk.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todas las cuentas están al día. 🎉
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {atRisk.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{h.name}</p>
                    <p className="text-xs text-amber-700">
                      {h.reasons.join(" · ")}
                    </p>
                  </div>
                  {h.overduePayments > 0 && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {h.overduePayments} vencido(s)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 4. Distribución por canal */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Distribución por canal</h2>
          {data.channels.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.channels.map((ch) => (
                <li key={ch.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{ch.label}</span>
                    <span className="text-muted-foreground">
                      {ch.leads} · {pct(ch.share)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, ch.share * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 3. Ranking global de vendedores */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">
          Ranking global de vendedores
        </h2>
        {data.vendors.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left">#</th>
                  <th className="pb-2 text-left">Vendedor</th>
                  <th className="pb-2 text-left">Empresa</th>
                  <th className="pb-2 text-right">Ventas</th>
                  <th className="pb-2 text-right">Facturación</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.map((v, i) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="py-2 font-medium">{v.name}</td>
                    <td className="py-2 text-muted-foreground">
                      {v.companyName}
                    </td>
                    <td className="py-2 text-right font-mono">{v.salesCount}</td>
                    <td className="py-2 text-right font-mono">
                      {formatARS(v.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-xs text-muted-foreground">
      Todavía no hay datos suficientes.
    </p>
  );
}

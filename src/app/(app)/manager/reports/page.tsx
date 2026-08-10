import { TrendingUp } from "lucide-react";

import { ExecutiveReportView } from "@/components/reports/executive-report-view";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { actingManagerId, requireRole } from "@/lib/auth";
import { loadExecutiveReport } from "@/lib/executive-report";

export default async function ManagerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await requireRole(["manager", "supervisor"]);
  const { from = "", to = "" } = await searchParams;

  if (!profile.company_id) return null;

  // El alcance del gerente es su equipo: se acota la lista de vendedores a los
  // suyos, y la RLS ya limita los leads a sus gerencias.
  const data = await loadExecutiveReport(
    { companyId: profile.company_id, managerId: actingManagerId(profile) },
    { from: from || null, to: to || null },
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingUp className="size-6 text-accent" /> Informe ejecutivo
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Desempeño de tu equipo, embudo, alertas de leads sin gestionar y qué
          hacer con cada cosa.{" "}
          {from || to ? "Período filtrado." : "Histórico completo."}
        </p>
      </header>

      <ReportToolbar
        basePath="/manager/reports"
        from={from}
        to={to}
        data={data}
      />

      <ExecutiveReportView data={data} />
    </div>
  );
}

import { TrendingUp } from "lucide-react";

import { ExecutiveReportView } from "@/components/reports/executive-report-view";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { requireRole } from "@/lib/auth";
import { loadExecutiveReport } from "@/lib/executive-report";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const { from = "", to = "" } = await searchParams;

  if (!profile.company_id) return null;

  // El Admin ve toda la concesionaria: sin `managerId`, entran todos los
  // vendedores de la empresa.
  const data = await loadExecutiveReport(
    { companyId: profile.company_id },
    { from: from || null, to: to || null },
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingUp className="size-6 text-accent" /> Informe ejecutivo
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Desempeño por vendedor, embudo, alertas de leads sin gestionar y
          recomendaciones accionables para toda la concesionaria.{" "}
          {from || to ? "Período filtrado." : "Histórico completo."}
        </p>
      </header>

      <ReportToolbar basePath="/admin/reports" from={from} to={to} data={data} />

      <ExecutiveReportView data={data} />
    </div>
  );
}

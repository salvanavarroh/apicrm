import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportRangeBar } from "@/components/reports/report-range-bar";
import { ReportView } from "@/components/reports/report-view";
import { requireRole } from "@/lib/auth";
import { loadReport } from "@/lib/reports/loaders";
import { findReport, quarterRange } from "@/lib/reports/registry";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Fuera del componente: la regla react-hooks/purity no deja llamar Date.now()
 *  durante el render. */
function defaultRangeFor(days: number): { from: string; to: string } {
  const now = Date.now();
  return {
    from: ymd(new Date(now - days * 24 * 60 * 60 * 1000)),
    to: ymd(new Date(now)),
  };
}

export default async function ReportePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin", "manager", "supervisor"]);
  const def = findReport(id);
  if (!def || !profile.company_id) notFound();
  if (!(def.roles as string[]).includes(profile.role)) notFound();

  const sp = await searchParams;

  // Rango por default del reporte: N días, o el trimestre en curso.
  const fallback =
    def.defaultRange === "quarter"
      ? quarterRange(new Date())
      : defaultRangeFor(def.defaultRange);

  const from = sp.from || fallback.from;
  const to = sp.to || fallback.to;

  const data = await loadReport(id, profile.company_id, { from, to });
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/reportes"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a Reportes
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{def.title}</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          {def.description}
        </p>
      </header>

      <ReportRangeBar basePath={`/admin/reportes/${id}`} from={from} to={to} />

      <ReportView
        data={data}
        title={`Período ${from} → ${to}`}
        fileName={`reporte-${id}-${from}-a-${to}`}
      />
    </div>
  );
}

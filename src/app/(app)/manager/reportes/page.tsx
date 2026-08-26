import {
  Cake,
  CalendarRange,
  ShoppingBag,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { reportsForRole } from "@/lib/reports/registry";

const ICONS: Record<string, LucideIcon> = {
  ShoppingBag,
  Users,
  CalendarRange,
  Trophy,
};

export default async function ReportesPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const reports = reportsForRole(profile.role);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Reportes que se generan en el momento sobre los datos de tu
          concesionaria. Cada uno tiene sus propios filtros y se exporta a Excel.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => {
          const Icon = ICONS[r.icon] ?? Users;
          return (
            <Link key={r.id} href={`/manager/reportes/${r.id}`}>
              <Card className="group h-full gap-3 p-5 transition-colors hover:border-accent/50">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-5" />
                </span>
                <h2 className="text-base font-bold">{r.title}</h2>
                <p className="text-sm text-muted-foreground">{r.description}</p>
                <span className="mt-auto text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir reporte →
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

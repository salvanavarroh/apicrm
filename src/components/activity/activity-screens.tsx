import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SellerActivityView } from "@/components/activity/seller-activity-view";
import { TeamActivityView } from "@/components/activity/team-activity-view";
import { ReportRangeBar } from "@/components/reports/report-range-bar";
import {
  loadSellerActivity,
  loadTeamActivity,
  type ActivityScope,
} from "@/lib/team-activity";

// Las pantallas de "Actividad del equipo" viven acá y no en las rutas porque
// admin y gerente muestran exactamente lo mismo: lo único que cambia es el
// scope (toda la concesionaria vs. el equipo del gerente) y el basePath. Las
// páginas de cada rol quedan en resolver el perfil y llamar a esto.

export const ACTIVITY_BLURB =
  "Cuánto tiempo estuvo cada vendedor dentro del CRM, en qué pantallas, y qué produjo en ese tiempo: leads gestionados, contactos, tareas, visitas y ventas.";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fuera del componente: react-hooks/purity no deja llamar Date.now() en el render. */
export function defaultActivityRange(days = 30): { from: string; to: string } {
  const now = Date.now();
  return {
    from: ymd(new Date(now - days * 86_400_000)),
    to: ymd(new Date(now)),
  };
}

export async function TeamActivityScreen({
  scope,
  basePath,
  from,
  to,
}: {
  scope: ActivityScope;
  basePath: string;
  from: string;
  to: string;
}) {
  const data = await loadTeamActivity(scope, { from, to });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Actividad del equipo
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          {ACTIVITY_BLURB}
        </p>
      </header>

      <ReportRangeBar basePath={basePath} from={from} to={to} />
      <TeamActivityView data={data} basePath={basePath} />
    </div>
  );
}

export async function SellerActivityScreen({
  scope,
  basePath,
  userId,
  from,
  to,
}: {
  scope: ActivityScope;
  basePath: string;
  userId: string;
  from: string;
  to: string;
}) {
  const data = await loadSellerActivity(scope, userId, { from, to });
  // Null = el vendedor no está en el scope de quien mira (otra gerencia, otra
  // empresa, o dado de baja). 404 y no un vacío: no confirmamos que exista.
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={basePath}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a Actividad del equipo
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{data.row.name}</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          {data.row.branch ?? "Sin sucursal"}
          {!data.row.active && " · usuario inactivo"}
        </p>
      </header>

      <ReportRangeBar basePath={`${basePath}/${userId}`} from={from} to={to} />
      <SellerActivityView data={data} />
    </div>
  );
}

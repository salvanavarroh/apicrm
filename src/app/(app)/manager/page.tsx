import {
  AlertTriangle,
  CalendarCheck,
  ChevronRight,
  Inbox,
  Megaphone,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { AgendaCalendar } from "@/components/dashboard/agenda-calendar";
import { ForecastCard } from "@/components/dashboard/forecast-card";
import { KpiCard } from "@/components/kpi-card";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { actingManagerId, requireRole } from "@/lib/auth";
import { fetchPaged } from "@/lib/leads-fetch";
import { fullName, type LeadStatus } from "@/lib/leads";
import { loadForecast } from "@/lib/forecast";
import { createClient } from "@/lib/supabase/server";
import {
  loadAgendaForCompany,
  todayDateKey,
} from "@/lib/tasks-visits-loader";

const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

// Un lead activo sin cambio de estado en 14 días es el caso que el gerente
// quiere ver primero (alerta de lead no gestionado).
const INACTIVE_DAYS = 14;

/** ISO de "hace N días". Fuera del componente: el lint de pureza de React no
 *  deja llamar `Date.now()` durante el render. */
function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

type TeamLead = {
  id: string;
  status: LeadStatus;
  assigned_user_id: string | null;
  campaign_id: string | null;
};

export default async function ManagerHomePage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();
  // El supervisor (sub-gerente) trabaja sobre el equipo de su gerente padre.
  const managerId = actingManagerId(profile);
  const cid = profile.company_id;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const inactiveCutoff = cutoffIso(INACTIVE_DAYS);

  const agendaItems = cid
    ? await loadAgendaForCompany(cid, { leadBasePath: "/manager/leads" })
    : [];
  const today = todayDateKey();

  const forecast = cid ? await loadForecast(supabase, { companyId: cid }) : null;

  // Contadores "generales" en la DB (count exact, head): PostgREST corta los
  // arrays en 1000 filas, así que contar sobre un array subestima en cuanto la
  // concesionaria tiene volumen. Ver [[leads-page-1000-row-cap]].
  const baseCount = () =>
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid!)
      .is("archived_at", null);

  const [
    { data: team },
    { data: salesMonth },
    { data: campaigns },
    activeRes,
    unassignedRes,
    staleRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status, commission_percent")
      .eq("company_id", cid!)
      .eq("manager_id", managerId)
      .eq("role", "sales"),
    supabase
      .from("sales")
      .select(
        "id, status, final_price, commission_percent_snapshot, vendor_id, started_at",
      )
      .eq("company_id", cid!)
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("company_id", cid!)
      .eq("status", "active"),
    baseCount().in("status", ACTIVE_STATUSES),
    baseCount().is("assigned_user_id", null),
    baseCount()
      .in("status", ACTIVE_STATUSES)
      .lt("status_changed_at", inactiveCutoff),
  ]);

  const teamIds = (team ?? []).map((t) => t.id);
  const totalActive = activeRes.count ?? 0;
  const unassignedCount = unassignedRes.count ?? 0;
  const staleCount = staleRes.count ?? 0;

  // Desglose por vendedor/campaña: se pide sólo lo del equipo (mucho menos que
  // toda la empresa) y en tandas, para que los totales no queden topados.
  const teamLeads =
    teamIds.length > 0
      ? (
          await fetchPaged<TeamLead>((withCount) =>
            supabase
              .from("leads")
              .select(
                "id, status, assigned_user_id, campaign_id",
                withCount ? { count: "exact" } : {},
              )
              .eq("company_id", cid!)
              .is("archived_at", null)
              .in("assigned_user_id", teamIds)
              .order("created_at", { ascending: false }),
          )
        ).rows
      : [];

  // Lista corta de leads atrasados, con nombre y link (antes mostraba sólo el
  // nombre del vendedor y un badge, así que no se podía accionar).
  const { data: inactive } = teamIds.length
    ? await supabase
        .from("leads")
        .select(
          `id, first_name, last_name, status, status_changed_at,
           assignee:profiles!assigned_user_id (first_name, last_name)`,
        )
        .eq("company_id", cid!)
        .is("archived_at", null)
        .in("assigned_user_id", teamIds)
        .in("status", ACTIVE_STATUSES)
        .lt("status_changed_at", inactiveCutoff)
        .order("status_changed_at", { ascending: true })
        .limit(6)
    : { data: [] };

  const pipelineByStatus = ACTIVE_STATUSES.map((s) => ({
    status: s,
    count: teamLeads.filter((l) => l.status === s).length,
  }));

  const acceptedMonth = (salesMonth ?? []).filter(
    (s) => s.status === "accepted",
  );

  // Métricas por vendedor.
  const perVendor = (team ?? []).map((v) => {
    const vendorLeads = teamLeads.filter((l) => l.assigned_user_id === v.id);
    const quoted = vendorLeads.filter((l) => l.status === "quoted").length;
    const contacted = vendorLeads.filter(
      (l) =>
        l.status === "contacted" ||
        l.status === "interested" ||
        l.status === "quoted",
    ).length;
    const sales = (salesMonth ?? []).filter((s) => s.vendor_id === v.id);
    return {
      id: v.id,
      name: fullName(v.first_name, v.last_name),
      status: v.status,
      total: vendorLeads.length,
      quoted,
      contacted,
      salesAccepted: sales.filter((s) => s.status === "accepted").length,
    };
  });

  // Campañas: cantidad de leads del equipo por campaña.
  const campaignRows = (campaigns ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      count: teamLeads.filter((l) => l.campaign_id === c.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Hola, {profile.first_name}
          </h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Resumen de tu gerencia: pipeline, métricas por vendedor y leads que
            necesitan atención.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/manager/reports">
            <TrendingUp className="mr-2 size-4" /> Informe ejecutivo
          </Link>
        </Button>
      </header>

      {/* 1. Datos generales ------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Inbox}
          label="Leads activos"
          value={totalActive}
          caption="En pipeline pre-venta"
        />
        <KpiCard
          icon={UserPlus}
          label="Sin asignar"
          value={unassignedCount}
          caption={
            unassignedCount > 0 ? "Esperando vendedor" : "Todos asignados"
          }
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas del mes"
          value={acceptedMonth.length}
          caption={`${(salesMonth ?? []).length} iniciadas`}
        />
        <KpiCard
          icon={Users}
          label="Vendedores activos"
          value={(team ?? []).filter((t) => t.status === "active").length}
          caption={`${teamIds.length} en el equipo`}
        />
      </div>

      {/* 2. Actividad ------------------------------------------------------ */}
      <Section icon={CalendarCheck} title="Actividad de hoy">
        <AgendaCalendar items={agendaItems} todayKey={today} />
      </Section>

      {/* 3. Lo que hay que accionar ---------------------------------------- */}
      <Section icon={AlertTriangle} title="Requiere atención">
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Sin asignar</h3>
              {unassignedCount > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/manager/leads?tab=unassigned">
                    Asignar <ChevronRight className="ml-1 size-3" />
                  </Link>
                </Button>
              )}
            </div>
            {unassignedCount === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Todos los leads están asignados.
              </p>
            ) : (
              <p className="text-3xl font-bold text-warning-foreground">
                {unassignedCount.toLocaleString("es-AR")}
              </p>
            )}
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Sin gestión hace +{INACTIVE_DAYS} días
              </p>
              <p
                className={`text-2xl font-bold ${
                  staleCount > 0 ? "text-destructive" : "text-success"
                }`}
              >
                {staleCount.toLocaleString("es-AR")}
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Leads sin movimiento (+{INACTIVE_DAYS} días)
              </h3>
              {staleCount > 6 && (
                <Link
                  href="/manager/leads?tab=table"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Ver todos →
                </Link>
              )}
            </div>
            {(inactive ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Ningún lead activo quedó sin gestión. 🎉
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(inactive ?? []).map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/manager/leads/${l.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-accent/50"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {fullName(l.first_name, l.last_name) || "Sin nombre"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {l.assignee
                            ? fullName(
                                l.assignee.first_name,
                                l.assignee.last_name,
                              )
                            : "Sin asignar"}
                          {" · "}
                          {daysAgoLabel(l.status_changed_at)}
                        </span>
                      </span>
                      <LeadStatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* 4. Pipeline y equipo --------------------------------------------- */}
      <Section icon={Inbox} title="Pipeline y equipo">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Pipeline del equipo</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pipelineByStatus.map((p) => (
                <div key={p.status} className="rounded-md border bg-card p-3">
                  <LeadStatusBadge status={p.status} />
                  <p className="mt-1 text-2xl font-semibold">{p.count}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-accent" /> Equipo
              </h3>
              {perVendor.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Todavía no tenés vendedores.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-muted text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-2 text-left">Vendedor</th>
                        <th className="pb-2 text-right">Asignados</th>
                        <th className="pb-2 text-right">Contactados</th>
                        <th className="pb-2 text-right">Presup.</th>
                        <th className="pb-2 text-right">Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perVendor.map((v) => (
                        <tr key={v.id} className="border-t">
                          <td className="py-2 font-medium">{v.name}</td>
                          <td className="py-2 text-right font-mono">
                            {v.total}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {v.contacted}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {v.quoted}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {v.salesAccepted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="size-4 text-accent" /> Campañas activas
              </h3>
              {campaignRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Sin campañas activas. Pediles al Admin que las cargue.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {campaignRows.slice(0, 5).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {c.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </Section>

      {/* 5. Proyección (lo menos urgente, al final) ----------------------- */}
      {forecast && (
        <Section icon={TrendingUp} title="Proyección">
          <ForecastCard forecast={forecast} />
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <Icon className="size-3.5 text-accent" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function daysAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return `hace ${days} días`;
}

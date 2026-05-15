import { ChevronRight, Inbox, Users } from "lucide-react";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { fullName, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

export default async function ManagerHomePage() {
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { data: leads },
    { data: team },
    { data: salesMonth },
    { data: campaigns },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `id, status, assigned_user_id, campaign_id, created_at, status_changed_at,
         assignee:profiles!assigned_user_id (id, first_name, last_name),
         campaign:campaigns (id, name)`,
      )
      .eq("company_id", profile.company_id!),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status, commission_percent")
      .eq("company_id", profile.company_id!)
      .eq("manager_id", profile.id)
      .eq("role", "sales"),
    supabase
      .from("sales")
      .select(
        "id, status, final_price, commission_percent_snapshot, vendor_id, started_at",
      )
      .eq("company_id", profile.company_id!)
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active"),
  ]);

  const teamIds = new Set((team ?? []).map((t) => t.id));
  const myLeads = (leads ?? []).filter(
    (l) => l.assigned_user_id && teamIds.has(l.assigned_user_id),
  );
  const unassignedInMine = (leads ?? []).filter(
    (l) =>
      !l.assigned_user_id &&
      l.campaign_id !== null,
  );

  const pipelineByStatus = ACTIVE_STATUSES.map((s) => ({
    status: s,
    count: myLeads.filter((l) => l.status === s).length,
  }));

  // Métricas por vendedor.
  const perVendor = (team ?? []).map((v) => {
    const vendorLeads = myLeads.filter((l) => l.assigned_user_id === v.id);
    const closed = vendorLeads.filter((l) => l.status === "quoted").length;
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
      closed,
      contacted,
      salesAccepted: sales.filter((s) => s.status === "accepted").length,
    };
  });

  // Campañas: cantidad de leads de la gerencia por campaña.
  const campaignRows = (campaigns ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      count: myLeads.filter((l) => l.campaign_id === c.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  // Inactivos: leads activos sin cambio en 14 días.
  const inactiveCutoff = new Date();
  inactiveCutoff.setDate(inactiveCutoff.getDate() - 14);
  const inactive = myLeads
    .filter(
      (l) =>
        ACTIVE_STATUSES.includes(l.status as LeadStatus) &&
        new Date(l.status_changed_at) < inactiveCutoff,
    )
    .slice(0, 5);

  const totalActive = myLeads.filter((l) =>
    ACTIVE_STATUSES.includes(l.status as LeadStatus),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {profile.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen de tu gerencia: pipeline, métricas por vendedor y leads que
          necesitan atención.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Leads activos" value={totalActive} />
        <Stat label="Sin asignar" value={unassignedInMine.length} />
        <Stat
          label="Ventas del mes"
          value={
            (salesMonth ?? []).filter((s) => s.status === "accepted").length
          }
        />
        <Stat label="Vendedores activos" value={(team ?? []).filter((t) => t.status === "active").length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Pipeline</h2>
          <div className="grid grid-cols-4 gap-2">
            {pipelineByStatus.map((p) => (
              <div
                key={p.status}
                className="rounded-md border bg-card p-3"
              >
                <LeadStatusBadge status={p.status} />
                <p className="mt-1 text-2xl font-semibold">{p.count}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sin asignar</h2>
            {unassignedInMine.length > 0 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/manager/leads/unassigned">
                  Asignar <ChevronRight className="ml-1 size-3" />
                </Link>
              </Button>
            )}
          </div>
          {unassignedInMine.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todos los leads están asignados.
            </p>
          ) : (
            <p className="text-2xl font-semibold text-warning-foreground">
              {unassignedInMine.length}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" /> Equipo
          </h2>
          {perVendor.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todavía no tenés vendedores.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
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
                    <td className="py-2 text-right font-mono">{v.total}</td>
                    <td className="py-2 text-right font-mono">{v.contacted}</td>
                    <td className="py-2 text-right font-mono">{v.closed}</td>
                    <td className="py-2 text-right font-mono">
                      {v.salesAccepted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4 text-muted-foreground" /> Campañas activas
          </h2>
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
                  <span>{c.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {c.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {inactive.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Leads sin movimiento (14+ días)
          </h2>
          <ul className="flex flex-col gap-2">
            {inactive.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs"
              >
                <span>{l.assignee?.first_name ?? "—"} ·</span>
                <LeadStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

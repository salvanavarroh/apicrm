import {
  Briefcase,
  ChevronRight,
  Inbox,
  Megaphone,
  ShoppingBag,
  Store,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DonutStat } from "@/components/donut-stat";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName, type LeadStatus } from "@/lib/leads";

const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

export default async function AdminHomePage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    branchesRes,
    ptsRes,
    campaignsRes,
    usersRes,
    leadsRes,
    salesMonthRes,
    pendingSalesRes,
  ] = await Promise.all([
    supabase.from("branches").select("status"),
    supabase.from("product_types").select("status"),
    supabase.from("campaigns").select("status"),
    supabase
      .from("profiles")
      .select("status, role")
      .neq("status", "deleted")
      .neq("role", "super_admin"),
    supabase
      .from("leads")
      .select("id, status, status_changed_at, assigned_user_id, created_at")
      .eq("company_id", profile.company_id),
    supabase
      .from("sales")
      .select("id, status, final_price, started_at")
      .eq("company_id", profile.company_id)
      .gte("started_at", monthStart.toISOString()),
    supabase
      .from("sales")
      .select(
        `
          id, started_at, final_price,
          lead:leads (first_name, last_name, vehicle_model),
          vendor:profiles!vendor_id (first_name, last_name)
        `,
      )
      .eq("company_id", profile.company_id)
      .eq("status", "evaluating")
      .order("started_at", { ascending: true })
      .limit(5),
  ]);

  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const users = usersRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const salesMonth = salesMonthRes.data ?? [];
  const pendingSales = pendingSalesRes.data ?? [];

  const branchesActive = branches.filter((b) => b.status === "active").length;
  const ptsActive = productTypes.filter((p) => p.status === "active").length;
  const campaignsActive = campaigns.filter((c) => c.status === "active").length;
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;
  const managers = users.filter((u) => u.role === "manager").length;
  const sellers = users.filter((u) => u.role === "sales").length;
  const providers = users.filter((u) => u.role === "data_provider").length;

  const activeLeads = leads.filter((l) =>
    ACTIVE_LEAD_STATUSES.includes(l.status as LeadStatus),
  );
  const unassigned = leads.filter((l) => !l.assigned_user_id).length;

  const acceptedMonth = salesMonth.filter((s) => s.status === "accepted");
  const ventasMonto = acceptedMonth.reduce(
    (acc, s) => acc + Number(s.final_price),
    0,
  );

  // Tasa conversión del mes: ventas aceptadas / leads creados en el mes
  const leadsMonth = leads.filter(
    (l) => new Date(l.created_at) >= monthStart,
  ).length;
  const conversionRate =
    leadsMonth > 0 ? Math.round((acceptedMonth.length / leadsMonth) * 100) : 0;

  // Semáforo de leads: verde <3d, amarillo 3-7d, rojo >7d sin gestión
  const now = new Date();
  const semaforo = { green: 0, yellow: 0, red: 0 };
  for (const l of activeLeads) {
    const days =
      (now.getTime() - new Date(l.status_changed_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 3) semaforo.green++;
    else if (days < 7) semaforo.yellow++;
    else semaforo.red++;
  }

  // Empty state si todavía no hay nada configurado
  if (branches.length === 0 && totalUsers <= 1) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Creá tu equipo para comenzar a gestionar leads y oportunidades de
            venta.
          </p>
        </header>

        <Card className="flex flex-col gap-6 p-8">
          <Users className="size-7 text-foreground" />
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            Comienza a crear tu equipo de ventas!
          </h2>
          <div className="flex flex-col items-start justify-between gap-4 border-l-[3px] border-accent pl-3 sm:flex-row sm:items-end">
            <p className="max-w-md text-sm text-muted-foreground">
              Podrás crear{" "}
              <strong className="text-foreground">gerentes de venta</strong> y{" "}
              <strong className="text-foreground">proveedor de datos</strong>.
            </p>
            <Button asChild>
              <Link href="/admin/users">
                Crear usuario
                <ChevronRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Monitoreá leads, ventas y la configuración de tu concesionaria.
          </p>
        </div>
        {pendingSales.length > 0 && (
          <Button asChild>
            <Link href="/admin/sales">
              {pendingSales.length} venta{pendingSales.length === 1 ? "" : "s"} por validar
              <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Inbox}
          label="Leads activos"
          value={activeLeads.length}
          caption={`${unassigned} sin asignar`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas del mes"
          value={acceptedMonth.length}
          caption={formatARS(ventasMonto)}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Conversión del mes"
          value={`${conversionRate}%`}
          caption={`${acceptedMonth.length} de ${leadsMonth} leads`}
        />
        <KpiCard
          icon={Users}
          label="Pendientes de aprobar"
          value={pendingSales.length}
          caption="Ventas en evaluación"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Estado de leads activos</h2>
            <Link
              href="/admin/leads"
              className="text-xs font-medium text-accent hover:underline"
            >
              Ver todos →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SemaphoreCard tone="green" label="Al día" value={semaforo.green} hint="< 3 días" />
            <SemaphoreCard
              tone="yellow"
              label="Atención"
              value={semaforo.yellow}
              hint="3-7 días sin gestión"
            />
            <SemaphoreCard
              tone="red"
              label="Crítico"
              value={semaforo.red}
              hint="+7 días sin gestión"
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4 text-accent" /> Usuarios
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-3xl font-bold leading-none tracking-tight">
                {totalUsers}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Total</p>
            </div>
            <DonutStat
              total={totalUsers}
              completed={activeUsers}
              pending={pendingUsers}
              labelCompleted="Activos"
              labelPending="Pendientes"
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={Store}
          label="Sucursales"
          value={branchesActive}
          caption={`${branches.length} totales`}
        />
        <KpiCard
          icon={Briefcase}
          label="Tipos de producto"
          value={ptsActive}
          caption={`${productTypes.length} totales`}
        />
        <KpiCard
          icon={Megaphone}
          label="Campañas"
          value={campaignsActive}
          caption={`${campaigns.length} totales`}
        />
        <KpiCard
          icon={UserCog}
          label="Gerentes"
          value={managers}
          caption="Cantidad de gerentes"
        />
        <KpiCard
          icon={Users}
          label="Vendedores"
          value={sellers}
          caption={`${providers} proveedores de datos`}
        />
      </div>

      {pendingSales.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b bg-muted px-5 py-3">
            <h2 className="text-sm font-semibold">Ventas pendientes de aprobar</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2">Lead</th>
                <th className="px-5 py-2">Vendedor</th>
                <th className="px-5 py-2 text-right">Monto</th>
                <th className="px-5 py-2">Inicio</th>
                <th className="px-5 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {pendingSales.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-5 py-3 font-medium">
                    {s.lead
                      ? fullName(s.lead.first_name, s.lead.last_name)
                      : "—"}
                    {s.lead?.vehicle_model && (
                      <span className="block text-xs text-muted-foreground">
                        {s.lead.vehicle_model}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.vendor
                      ? fullName(s.vendor.first_name, s.vendor.last_name)
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    {formatARS(s.final_price)}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {new Date(s.started_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/sales/${s.id}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Validar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeLeads.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Sin leads activos. Cargá tu primer lead o pediles a los vendedores
          que empiecen a gestionar.
        </Card>
      )}
    </div>
  );
}

function SemaphoreCard({
  tone,
  label,
  value,
  hint,
}: {
  tone: "green" | "yellow" | "red";
  label: string;
  value: number;
  hint: string;
}) {
  const cls =
    tone === "green"
      ? "border-success/40 bg-success/5"
      : tone === "yellow"
        ? "border-warning/40 bg-warning/5"
        : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-md border ${cls} p-3`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

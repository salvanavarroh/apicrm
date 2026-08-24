import {
  Building2,
  ChevronRight,
  CreditCard,
  Link2,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DonutStat } from "@/components/donut-stat";
import { KpiCard } from "@/components/kpi-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";

function periodLabel(p: { period_year: number; period_month: number }) {
  const months = [
    "Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic",
  ];
  return `${months[p.period_month - 1]} ${String(p.period_year).slice(2)}`;
}

export default async function SuperAdminHomePage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();
  const admin = createAdminClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    companiesRes,
    paymentsRes,
    branchesCount,
    usersByRole,
    salesAccepted,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, status, monthly_price"),
    supabase
      .from("subscription_payments")
      .select(
        "id, status, amount, due_date, period_year, period_month, company:companies!subscription_payments_company_id_fkey(id, name, phone, status, profiles!profiles_company_id_fkey(first_name, last_name, role))",
      )
      .order("due_date", { ascending: true }),
    admin.from("branches").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("role, status")
      .neq("status", "deleted"),
    admin
      .from("sales")
      .select("final_price")
      .eq("status", "accepted"),
  ]);

  const totalBranches = branchesCount.count ?? 0;
  const users = usersByRole.data ?? [];
  const adminsCount = users.filter((u) => u.role === "admin").length;
  const managersCount = users.filter((u) => u.role === "manager").length;
  const salesCount = users.filter((u) => u.role === "sales").length;
  const providersCount = users.filter(
    (u) => u.role === "data_provider",
  ).length;
  const totalSalesCount = salesAccepted.data?.length ?? 0;
  const totalSalesAmount = (salesAccepted.data ?? []).reduce(
    (acc, s) => acc + Number(s.final_price),
    0,
  );

  const companies = companiesRes.data ?? [];
  type Payment = {
    id: string;
    status: "pending" | "paid" | "overdue";
    amount: number;
    due_date: string;
    period_year: number;
    period_month: number;
    company: {
      id: string;
      name: string;
      phone: string | null;
      status: "active" | "pending" | "suspended";
      profiles: { first_name: string; last_name: string; role: string }[];
    };
  };
  const payments = (paymentsRes.data ?? []) as unknown as Payment[];

  // Empty state si todavía no hay concesionarias
  if (companies.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Dá de alta concesionarias, sus sucursales y responsables desde un
            solo lugar.
          </p>
        </header>

        <Card className="flex flex-col gap-6 p-8">
          <Building2 className="size-7 text-foreground" />
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            Comienza a crear concesionarias ahora!
          </h2>
          <div className="flex flex-col items-start justify-between gap-4 border-l-[3px] border-accent pl-3 sm:flex-row sm:items-end">
            <p className="max-w-md text-sm text-muted-foreground">
              Podrás crear{" "}
              <strong className="text-foreground">concesionarias</strong> y
              asignar{" "}
              <strong className="text-foreground">administradores</strong>.
            </p>
            <Button asChild>
              <Link href="/super-admin/companies?nueva=1">
                Cargar concesionaria
                <ChevronRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Dashboard cuando hay datos
  const activeCount = companies.filter((c) => c.status === "active").length;
  const pendingCount = companies.filter((c) => c.status === "pending").length;
  const paidCount = payments.filter((p) => p.status === "paid").length;
  const unpaidCount = payments.filter((p) => p.status !== "paid").length;

  // Facturación del mes en curso (suma de pagos del periodo actual)
  const now = new Date();
  const monthRevenue = payments
    .filter(
      (p) =>
        p.period_year === now.getUTCFullYear() &&
        p.period_month === now.getUTCMonth() + 1,
    )
    .reduce((acc, p) => acc + Number(p.amount), 0);

  const overduePayments = payments
    .filter((p) => p.status !== "paid")
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Dá de alta concesionarias, sus sucursales y responsables desde un
            solo lugar.
          </p>
        </div>
        <Button asChild>
          <Link href="/super-admin/companies?nueva=1">
            Cargar concesionaria
            <ChevronRight className="ml-1 size-4" />
          </Link>
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Empresas"
          value={companies.length}
          caption={`${activeCount} activas`}
        />
        <KpiCard
          icon={Store}
          label="Sucursales"
          value={totalBranches}
          caption="Total en la plataforma"
        />
        <KpiCard
          icon={Users}
          label="Usuarios"
          value={users.length}
          caption={`${adminsCount}A · ${managersCount}G · ${salesCount}V · ${providersCount}P`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas totales"
          value={totalSalesCount}
          caption={formatARS(totalSalesAmount)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 className="size-4 text-accent" />
            Métricas globales
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-3xl font-bold leading-none tracking-tight">
                {companies.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Concesionarias creadas
              </p>
            </div>
            <DonutStat
              total={companies.length}
              completed={activeCount}
              pending={pendingCount}
              labelCompleted="Activas"
              labelPending="Pendientes"
            />
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="flex flex-col gap-1 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CreditCard className="size-4 text-success" />
              Pagos realizados
            </div>
            <p className="text-3xl font-bold leading-none tracking-tight">
              {paidCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cantidad de pagos realizados al día de la fecha
            </p>
          </Card>

          <Card className="flex flex-col gap-1 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <WalletCards className="size-4 text-destructive" />
              Pagos no realizados
            </div>
            <p className="text-3xl font-bold leading-none tracking-tight">
              {unpaidCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cantidad de pagos no realizados al día de la fecha
            </p>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-1 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 className="size-4 text-accent" />
            Concesionarias activas
          </div>
          <p className="text-3xl font-bold leading-none tracking-tight">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cantidad de concesionarias activas
          </p>
        </Card>

        <Card className="flex flex-col gap-1 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Link2 className="size-4 text-accent" />
            Facturación mensual
          </div>
          <p className="text-3xl font-bold leading-none tracking-tight">
            {formatARS(monthRevenue)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ingresos mensuales
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Pagos pendientes</h2>
        <Card className="overflow-hidden p-0">
          {overduePayments.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
              <Wallet className="size-4" />
              No hay pagos pendientes — todo al día.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">

              <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Concesionaria</th>
                  <th className="px-4 py-3 font-medium">Administrador</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Período</th>
                  <th className="px-4 py-3 font-medium">Vencimiento</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {overduePayments.map((p) => {
                  const admin = p.company.profiles.find(
                    (pr) => pr.role === "admin",
                  );
                  const adminName = admin
                    ? `${admin.first_name} ${admin.last_name}`.trim()
                    : "—";
                  const overdue = new Date(p.due_date) < new Date();
                  return (
                    <tr key={p.id} className="border-t border-border bg-card hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        {p.company.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {adminName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.company.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatARS(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {periodLabel(p)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.due_date}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            overdue
                              ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                              : "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground"
                          }
                        >
                          {overdue ? "Vencido" : "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      </div>
    </div>
  );
}

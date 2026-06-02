import {
  Building2,
  ChevronRight,
  PencilLine,
  Shield,
  ShieldCheck,
  Store,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CreateCompanyDialog } from "./create-company-dialog";
import { EditCompanyAsSuperAdminDialog } from "./[id]/edit-company-dialog";

type CompanyData = {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended";
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  monthly_price: number | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  created_at: string;
};

export default async function CompaniesPage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();

  const [companiesRes, profilesRes, branchesRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, status, legal_name, cuit, phone, address, logo_url, monthly_price, subscription_starts_at, subscription_ends_at, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("company_id, role, first_name, last_name, status")
      .neq("status", "deleted"),
    supabase.from("branches").select("company_id, status"),
  ]);

  const companies = (companiesRes.data ?? []) as CompanyData[];
  const profiles = profilesRes.data ?? [];
  const branches = branchesRes.data ?? [];

  // Aggregaciones globales (KPIs arriba).
  const adminsCount = profiles.filter((p) => p.role === "admin").length;
  const managersCount = profiles.filter((p) => p.role === "manager").length;
  const salesCount = profiles.filter((p) => p.role === "sales").length;
  const branchesCount = branches.filter((b) => b.status === "active").length;

  // Aggregaciones por empresa (filas).
  const byCompany = new Map<
    string,
    {
      admins: number;
      managers: number;
      sales: number;
      branches: number;
      primaryAdmin: { first_name: string; last_name: string } | null;
    }
  >();
  for (const c of companies) {
    byCompany.set(c.id, {
      admins: 0,
      managers: 0,
      sales: 0,
      branches: 0,
      primaryAdmin: null,
    });
  }
  for (const p of profiles) {
    if (!p.company_id) continue;
    const bucket = byCompany.get(p.company_id);
    if (!bucket) continue;
    if (p.role === "admin") {
      bucket.admins++;
      if (!bucket.primaryAdmin) {
        bucket.primaryAdmin = {
          first_name: p.first_name,
          last_name: p.last_name,
        };
      }
    } else if (p.role === "manager") bucket.managers++;
    else if (p.role === "sales") bucket.sales++;
  }
  for (const b of branches) {
    if (!b.company_id) continue;
    const bucket = byCompany.get(b.company_id);
    if (!bucket) continue;
    if (b.status === "active") bucket.branches++;
  }

  const cta = (
    <Button>
      Cargar concesionaria <ChevronRight className="ml-1 size-4" />
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Concesionarias</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Visualizá y gestioná todas las concesionarias, sus equipos y
            desempeño.
          </p>
        </div>
        <CreateCompanyDialog trigger={cta} />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={Building2}
          label="Concesionarias"
          value={companies.length}
          caption="Total en la plataforma"
        />
        <KpiCard
          icon={Store}
          label="Sucursales"
          value={branchesCount}
          caption="Sucursales activas"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Admins"
          value={adminsCount}
          caption="Cantidad de administradores"
        />
        <KpiCard
          icon={UserCog}
          label="Gerentes"
          value={managersCount}
          caption="Cantidad de gerentes"
        />
        <KpiCard
          icon={Users}
          label="Vendedores"
          value={salesCount}
          caption="Cantidad de vendedores"
        />
      </div>

      {companies.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Building2 className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no hay concesionarias. Cargá la primera para arrancar.
          </p>
          <CreateCompanyDialog
            trigger={
              <Button variant="outline" size="sm">
                Crear concesionaria
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Concesionaria</th>
                <th className="px-4 py-3 font-medium">Administrador</th>
                <th className="px-4 py-3 text-center font-medium">Sucursales</th>
                <th className="px-4 py-3 text-center font-medium">Admins</th>
                <th className="px-4 py-3 text-center font-medium">Gerentes</th>
                <th className="px-4 py-3 text-center font-medium">Vendedores</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const agg = byCompany.get(c.id) ?? {
                  admins: 0,
                  managers: 0,
                  sales: 0,
                  branches: 0,
                  primaryAdmin: null,
                };
                const display = agg.primaryAdmin
                  ? `${agg.primaryAdmin.first_name} ${agg.primaryAdmin.last_name}`.trim() ||
                    "—"
                  : "—";

                return (
                  <tr
                    key={c.id}
                    className="border-t border-border bg-card hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/super-admin/companies/${c.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Shield className="size-3.5 text-accent" />
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {display}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">
                      {agg.branches}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">
                      {agg.admins}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">
                      {agg.managers}
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">
                      {agg.sales}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <EditCompanyAsSuperAdminDialog
                          initial={{
                            id: c.id,
                            name: c.name,
                            legal_name: c.legal_name,
                            cuit: c.cuit,
                            phone: c.phone,
                            address: c.address,
                            logo_url: c.logo_url,
                            monthly_price: c.monthly_price
                              ? Number(c.monthly_price)
                              : null,
                            subscription_starts_at: c.subscription_starts_at,
                            subscription_ends_at: c.subscription_ends_at,
                            status: c.status,
                          }}
                          trigger={
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label="Editar"
                              className="size-8"
                            >
                              <PencilLine className="size-3.5" />
                            </Button>
                          }
                        />
                        <Button
                          asChild
                          variant="outline"
                          size="icon"
                          aria-label="Detalle"
                          className="size-8"
                        >
                          <Link href={`/super-admin/companies/${c.id}`}>
                            <ChevronRight className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "pending" | "suspended";
}) {
  const cfg =
    status === "active"
      ? { label: "Activa", cls: "bg-success/10 text-success" }
      : status === "pending"
        ? {
            label: "Pendiente",
            cls: "bg-warning/10 text-warning-foreground",
          }
        : { label: "Suspendida", cls: "bg-destructive/10 text-destructive" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

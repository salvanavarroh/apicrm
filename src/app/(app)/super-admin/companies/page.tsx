import {
  Building2,
  ChevronRight,
  ShieldCheck,
  Store,
  UserCog,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CreateCompanyDialog } from "./create-company-dialog";
import { CompaniesTable, type CompanyRow } from "./companies-table";

import type { CompanyPlan } from "@/lib/plans";

type CompanyData = {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended";
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  plan: CompanyPlan | null;
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
        "id, name, status, legal_name, cuit, phone, address, logo_url, plan, monthly_price, subscription_starts_at, subscription_ends_at, created_at",
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

  // Filas para la tabla (client component con búsqueda + orden).
  const rows: CompanyRow[] = companies.map((c) => {
    const agg = byCompany.get(c.id) ?? {
      admins: 0,
      managers: 0,
      sales: 0,
      branches: 0,
      primaryAdmin: null,
    };
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      legal_name: c.legal_name,
      cuit: c.cuit,
      phone: c.phone,
      address: c.address,
      logo_url: c.logo_url,
      plan: c.plan,
      monthly_price: c.monthly_price,
      subscription_starts_at: c.subscription_starts_at,
      subscription_ends_at: c.subscription_ends_at,
      primaryAdmin: agg.primaryAdmin
        ? `${agg.primaryAdmin.first_name} ${agg.primaryAdmin.last_name}`.trim() ||
          "—"
        : "—",
      branches: agg.branches,
      admins: agg.admins,
      managers: agg.managers,
      sales: agg.sales,
    };
  });

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
        <CompaniesTable rows={rows} />
      )}
    </div>
  );
}

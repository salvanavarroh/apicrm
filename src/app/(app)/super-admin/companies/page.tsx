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

type CompanyRow = {
  id: string;
  name: string;
  status: string;
  monthly_price: number | null;
  subscription_ends_at: string | null;
  created_at: string;
  admins: { first_name: string; last_name: string }[];
};

export default async function CompaniesPage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();

  const [companiesRes, profilesRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, status, monthly_price, subscription_ends_at, created_at, admins:profiles!profiles_company_id_fkey(first_name, last_name, role)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("role"),
  ]);

  const companies = (companiesRes.data ?? []) as Array<
    Omit<CompanyRow, "admins"> & {
      admins: { first_name: string; last_name: string; role: string }[];
    }
  >;
  const profiles = profilesRes.data ?? [];

  const adminsCount = profiles.filter((p) => p.role === "admin").length;
  const managersCount = profiles.filter((p) => p.role === "manager").length;
  const salesCount = profiles.filter((p) => p.role === "sales").length;

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
          caption="Cantidad de concesionarias activas"
        />
        <KpiCard
          icon={Store}
          label="Sucursales"
          value={0}
          caption="Cantidad de sucursales activas"
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
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Concesionaria</th>
                <th className="px-4 py-3 font-medium">Administrador</th>
                <th className="px-4 py-3 font-medium">Sucursales</th>
                <th className="px-4 py-3 font-medium">Admins</th>
                <th className="px-4 py-3 font-medium">Gerentes</th>
                <th className="px-4 py-3 font-medium">Vendedores</th>
                <th className="px-4 py-3 font-medium">Leads</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const adminName = c.admins.find((p) => p.role === "admin");
                const display = adminName
                  ? `${adminName.first_name} ${adminName.last_name}`.trim() ||
                    "—"
                  : "—";

                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <Shield className="size-3.5 text-accent" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {display}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">0</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.admins.filter((p) => p.role === "admin").length}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">0</td>
                    <td className="px-4 py-3 text-muted-foreground">0</td>
                    <td className="px-4 py-3 text-muted-foreground">0</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Editar"
                          className="size-8"
                          disabled
                        >
                          <PencilLine className="size-3.5" />
                        </Button>
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

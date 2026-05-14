import {
  Briefcase,
  Building2,
  ChevronRight,
  Megaphone,
  Store,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DonutStat } from "@/components/donut-stat";
import { KpiCard } from "@/components/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export default async function AdminHomePage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();

  const [branchesRes, ptsRes, campaignsRes, usersRes] = await Promise.all([
    supabase.from("branches").select("status"),
    supabase.from("product_types").select("status"),
    supabase.from("campaigns").select("status"),
    supabase
      .from("profiles")
      .select("status, role")
      .neq("status", "deleted")
      .neq("role", "super_admin"),
  ]);

  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const users = usersRes.data ?? [];

  const branchesActive = branches.filter((b) => b.status === "active").length;
  const ptsActive = productTypes.filter((p) => p.status === "active").length;
  const campaignsActive = campaigns.filter((c) => c.status === "active").length;
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;
  const managers = users.filter((u) => u.role === "manager").length;
  const sellers = users.filter((u) => u.role === "sales").length;
  const providers = users.filter((u) => u.role === "data_provider").length;

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
            Monitoreá el rendimiento de tu equipo y la configuración de tu
            concesionaria.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/users">
            Cargar usuarios
            <ChevronRight className="ml-1 size-4" />
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4 text-accent" />
            Métricas globales
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-3xl font-bold leading-none tracking-tight">
                {totalUsers}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Usuarios totales
              </p>
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

        <div className="grid gap-4">
          <Card className="flex flex-col gap-1 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="size-4 text-accent" />
              Usuarios activos
            </div>
            <p className="text-3xl font-bold leading-none tracking-tight">
              {activeUsers}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cantidad de usuarios activos
            </p>
          </Card>

          <Card className="flex flex-col gap-1 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="size-4 text-accent" />
              Configuración
            </div>
            <p className="text-3xl font-bold leading-none tracking-tight">
              {branches.length + productTypes.length + campaigns.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Items configurados (sucursales + tipos + campañas)
            </p>
          </Card>
        </div>
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

      <Card className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">Leads pendientes</h2>
          <p className="text-sm text-muted-foreground">
            Disponible desde Sprint 4. Acá vas a ver los leads sin asignar y los
            que esperan gestión de tu equipo.
          </p>
        </div>
        <Button variant="outline" disabled>
          Ver todos
        </Button>
      </Card>
    </div>
  );
}

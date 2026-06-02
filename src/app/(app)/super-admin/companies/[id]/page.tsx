import {
  Building2,
  ChevronLeft,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CreateBranchDialog } from "./create-branch-dialog";
import { EditCompanyAsSuperAdminDialog } from "./edit-company-dialog";
import { UsersDialog, type CompanyUser } from "./users-dialog";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["super_admin"]);
  const { id } = await params;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [companyRes, branchesRes, profilesRes, usersList] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, legal_name, cuit, phone, address, logo_url, monthly_price, subscription_starts_at, subscription_ends_at, status, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, address, phone, status")
      .eq("company_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role, status, branch_id")
      .eq("company_id", id)
      .neq("status", "deleted"),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (!companyRes.data) notFound();
  const company = companyRes.data;
  const branches = branchesRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const admins = profiles.filter((p) => p.role === "admin");
  const managers = profiles.filter((p) => p.role === "manager");
  const sellers = profiles.filter((p) => p.role === "sales");
  const providers = profiles.filter((p) => p.role === "data_provider");
  const primaryAdmin = admins[0];

  const emailById = new Map<string, string>();
  for (const u of usersList.data?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }
  const branchNameById = new Map<string, string>();
  for (const b of branches) branchNameById.set(b.id, b.name);
  const companyUsers: CompanyUser[] = profiles.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: emailById.get(p.id) ?? "—",
    role: p.role as CompanyUser["role"],
    status: p.status as CompanyUser["status"],
    branch_name: p.branch_id ? (branchNameById.get(p.branch_id) ?? null) : null,
  }));

  function adminName(p: typeof primaryAdmin | undefined) {
    if (!p) return "—";
    return `${p.first_name} ${p.last_name}`.trim() || "—";
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
      >
        <Link href="/super-admin/companies">
          <ChevronLeft className="size-4" /> Volver a Concesionarias
        </Link>
      </Button>

      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          <div className="flex flex-col gap-1 border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Admin:</strong>{" "}
              {adminName(primaryAdmin)}
            </p>
            {company.address && (
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {company.address}
              </p>
            )}
            <p className="text-xs">
              Alta:{" "}
              {new Date(company.created_at).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditCompanyAsSuperAdminDialog
            initial={{
              id: company.id,
              name: company.name,
              legal_name: company.legal_name,
              cuit: company.cuit,
              phone: company.phone,
              address: company.address,
              logo_url: company.logo_url,
              monthly_price: company.monthly_price
                ? Number(company.monthly_price)
                : null,
              subscription_starts_at: company.subscription_starts_at,
              subscription_ends_at: company.subscription_ends_at,
              status: company.status,
            }}
            trigger={
              <Button variant="outline" size="icon" aria-label="Editar">
                <PencilLine className="size-4" />
              </Button>
            }
          />
          <UsersDialog
            companyName={company.name}
            users={companyUsers}
            trigger={
              <Button variant="outline">
                <Users className="mr-1 size-4" /> Ver lista de usuarios
              </Button>
            }
          />
          <CreateBranchDialog
            companyId={company.id}
            trigger={
              <Button>
                Cargar nueva sucursal
                <Plus className="ml-1 size-4" />
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Store}
          label="Sucursales"
          value={branches.length}
          caption="Cantidad de sucursales activas"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Admins"
          value={admins.length}
          caption="Cantidad de administradores"
        />
        <KpiCard
          icon={UserCog}
          label="Gerentes"
          value={managers.length}
          caption="Cantidad de gerentes"
        />
        <KpiCard
          icon={Users}
          label="Vendedores"
          value={sellers.length}
          caption="Cantidad de vendedores"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">
          Sucursales ({branches.length})
        </h2>

        {branches.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <Store className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Todavía no hay sucursales cargadas.
            </p>
          </Card>
        ) : (
          branches.map((b) => {
            const branchManagers = managers.filter(
              (m) => m.branch_id === b.id,
            );
            const branchSellers = sellers.filter((s) => s.branch_id === b.id);
            return (
              <Card key={b.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-foreground" />
                      <span className="text-lg font-semibold">{b.name}</span>
                      <span
                        className={
                          b.status === "active"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {b.status === "active" ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    {b.address && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5" /> {b.address}
                      </p>
                    )}
                    {b.phone && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="size-3.5" /> {b.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Toggle estado"
                      disabled
                    >
                      <Building2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Eliminar"
                      className="text-destructive"
                      disabled
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <BranchStat
                    icon={UserPlus}
                    label="Proveedores"
                    value={providers.length}
                  />
                  <BranchStat
                    icon={UserCog}
                    label="Gerentes"
                    value={branchManagers.length}
                  />
                  <BranchStat
                    icon={Users}
                    label="Vendedores"
                    value={branchSellers.length}
                  />
                  <BranchStat
                    icon={Wallet}
                    label="Leads activos"
                    value="—"
                    caption="Sprint 4"
                  />
                  <BranchStat
                    icon={Wallet}
                    label="Ventas"
                    value="—"
                    caption="Sprint 7"
                  />
                  <BranchStat
                    icon={Wallet}
                    label="Conversión"
                    value="—"
                    caption="Sprint 7"
                  />
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function BranchStat({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-accent" />
        {label}
      </div>
      <p className="text-2xl font-bold leading-none tracking-tight">{value}</p>
      {caption && (
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}

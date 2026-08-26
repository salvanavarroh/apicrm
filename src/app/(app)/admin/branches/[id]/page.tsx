import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MapPin,
  Phone,
  ShoppingBag,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName, type LeadStatus } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

export default async function AdminBranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    branchRes,
    profilesRes,
    managementsRes,
    leadsRes,
    salesRes,
    emailsRes,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, address, phone, status, created_at")
      .eq("id", id)
      .eq("company_id", profile.company_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, role, status, phone, branch_id, manager_id, avatar_url",
      )
      .eq("company_id", profile.company_id)
      .neq("status", "deleted"),
    supabase
      .from("managements")
      .select(
        "manager_id, branch_id, product_type_id, auto_assignment_enabled, product_type:product_types!product_type_id(name)",
      )
      .eq("branch_id", id),
    supabase
      .from("leads")
      .select(
        "id, status, branch_id, assigned_user_id, created_at, first_name, last_name",
      )
      .eq("company_id", profile.company_id)
      .eq("branch_id", id),
    // sales no tiene branch_id; filtramos vía lead_id (los leads que ya
    // pertenecen a esta sucursal).
    supabase
      .from("sales")
      .select("id, status, lead_id, final_price, started_at")
      .eq("company_id", profile.company_id)
      .gte("started_at", monthStart.toISOString()),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const branch = branchRes.data;
  if (!branch) notFound();

  const allProfiles = profilesRes.data ?? [];
  const managements = managementsRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const salesMonth = salesRes.data ?? [];
  const emailMap = new Map<string, string>();
  for (const u of emailsRes.data.users) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  const managerIds = new Set(managements.map((m) => m.manager_id));
  const managers = allProfiles.filter((p) => managerIds.has(p.id));
  const vendors = allProfiles.filter(
    (p) => p.role === "sales" && p.branch_id === id,
  );
  // Proveedores son company-wide (no scoped por branch).
  const providers = allProfiles.filter((p) => p.role === "data_provider");

  const activeLeads = leads.filter((l) =>
    ACTIVE_LEAD_STATUSES.includes(l.status as LeadStatus),
  );
  const pendingLeads = leads.filter((l) => !l.assigned_user_id);

  // Filtrar sales del mes a las que tienen lead en esta sucursal.
  const leadIdsInBranch = new Set(leads.map((l) => l.id));
  const salesAccepted = salesMonth.filter(
    (s) => s.status === "accepted" && leadIdsInBranch.has(s.lead_id),
  );
  const salesAmount = salesAccepted.reduce(
    (acc, s) => acc + Number(s.final_price ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/company"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a Mi empresa
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-12 items-center justify-center rounded-md bg-accent/10 text-accent">
            <Building2 className="size-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {branch.name}
              </h1>
              <span
                className={
                  branch.status === "active"
                    ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                }
              >
                {branch.status === "active" ? "Activa" : "Inactiva"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {branch.address && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {branch.address}
                </p>
              )}
              {branch.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {branch.phone}
                </p>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" asChild className="bg-card">
          <Link href={`/admin/users?branch=${branch.id}`}>
            Ver lista de usuarios
          </Link>
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={Inbox}
          label="Leads activos"
          value={activeLeads.length}
          caption={`${pendingLeads.length} sin asignar`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ventas del mes"
          value={salesAccepted.length}
          caption={formatARS(salesAmount)}
        />
        <KpiCard
          icon={UserCog}
          label="Gerentes"
          value={managers.length}
          caption="Asignados a esta sucursal"
        />
        <KpiCard
          icon={Users}
          label="Vendedores"
          value={vendors.length}
          caption="Trabajando en esta sucursal"
        />
        <KpiCard
          icon={UserPlus}
          label="Proveedores"
          value={providers.length}
          caption="Empresa-wide"
        />
      </div>

      {/* Gerentes */}
      <section className="flex flex-col gap-3">
        <h2 id="gerentes" className="text-lg font-semibold tracking-tight">
          Gerentes ({managers.length})
        </h2>
        {managers.length === 0 ? (
          <EmptyCard icon={UserCog} text="No hay gerentes asignados a esta sucursal todavía." />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {managers.map((m) => {
                const email = emailMap.get(m.id) ?? "—";
                const ptsForMgr = managements
                  .filter((mg) => mg.manager_id === m.id)
                  .map((mg) => mg.product_type?.name)
                  .filter(Boolean);
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <Link
                      href={`/admin/users/${m.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <UserAvatar
                        firstName={m.first_name}
                        lastName={m.last_name}
                        email={email}
                        avatarUrl={m.avatar_url}
                        role="manager"
                        size="md"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {fullName(m.first_name, m.last_name) ||
                            "(sin nombre)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {email}
                        </span>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {ptsForMgr.map((p, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-muted px-2 py-0.5"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Vendedores */}
      <section className="flex flex-col gap-3">
        <h2 id="vendedores" className="text-lg font-semibold tracking-tight">
          Vendedores ({vendors.length})
        </h2>
        {vendors.length === 0 ? (
          <EmptyCard
            icon={Users}
            text="No hay vendedores asignados a esta sucursal."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {vendors.map((v) => {
                const email = emailMap.get(v.id) ?? "—";
                return (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        firstName={v.first_name}
                        lastName={v.last_name}
                        email={email}
                        avatarUrl={v.avatar_url}
                        role="sales"
                        size="md"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {fullName(v.first_name, v.last_name) ||
                            "(sin nombre)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {email}
                        </span>
                      </div>
                    </div>
                    <span
                      className={
                        v.status === "active"
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      }
                    >
                      {v.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Leads recientes */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Leads recientes ({leads.length})
          </h2>
          <Button variant="outline" size="sm" asChild className="bg-card">
            <Link href={`/admin/leads?branch=${branch.id}`}>
              Ver todos <ChevronRight className="ml-1 size-3" />
            </Link>
          </Button>
        </div>
        {leads.length === 0 ? (
          <EmptyCard
            icon={Inbox}
            text="Esta sucursal todavía no recibió leads."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {leads.slice(0, 5).map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <Link
                    href={`/admin/leads/${l.id}`}
                    className="flex flex-1 items-center gap-3 hover:underline"
                  >
                    <span className="text-sm font-medium">
                      {fullName(l.first_name, l.last_name) || "(sin nombre)"}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function EmptyCard({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </Card>
  );
}

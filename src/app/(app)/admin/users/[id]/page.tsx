import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  ShieldCheck,
  Truck,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserAvatar } from "@/components/user-avatar";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { UserActions } from "./user-actions";
import { EditUserDialog } from "./edit-user-dialog";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [{ data: user }, branchesRes, ptsRes, emailsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, role, status, phone, branch_id, manager_id, commission_percent, commission_conditions, avatar_url, can_export_leads",
      )
      .eq("id", id)
      .eq("company_id", profile.company_id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id),
    supabase
      .from("product_types")
      .select("id, name")
      .eq("company_id", profile.company_id),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (!user) notFound();
  if (
    user.role !== "manager" &&
    user.role !== "data_provider" &&
    user.role !== "sales" &&
    user.role !== "admin"
  ) {
    notFound();
  }

  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const email =
    emailsRes.data.users.find((u) => u.id === user.id)?.email ?? "—";

  const isManager = user.role === "manager";
  const isVendor = user.role === "sales";
  const isProvider = user.role === "data_provider";

  let teamStats: {
    vendors: TeamMember[];
    activeLeads: number;
    pendingLeads: number;
    salesAccepted: number;
    salesMonthAmount: number;
    managements: { branch: string; product_type: string; auto: boolean }[];
  } | null = null;
  let vendorStats: {
    leadsActive: number;
    leadsTotal: number;
    salesAccepted: number;
    salesMonthAmount: number;
    commissionAccrued: number;
    branchName: string | null;
    managerName: string | null;
  } | null = null;
  let providerStats: {
    leadsTotal: number;
    leadsActive: number;
    leadsPool: number;
  } | null = null;

  if (isManager) {
    teamStats = await loadManagerStats({
      managerId: user.id,
      companyId: profile.company_id,
      branches,
      productTypes,
      emails: emailsRes.data.users,
    });
  } else if (isVendor) {
    vendorStats = await loadVendorStats({
      vendorId: user.id,
      companyId: profile.company_id,
      branches,
      branchId: user.branch_id,
      managerId: user.manager_id,
      commissionPct: Number(user.commission_percent ?? 0),
    });
  } else if (isProvider) {
    providerStats = await loadProviderStats({
      providerId: user.id,
      companyId: profile.company_id,
    });
  }

  const backHref = "/admin/users";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a usuarios
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <UserAvatar
            firstName={user.first_name}
            lastName={user.last_name}
            email={email}
            avatarUrl={user.avatar_url}
            role={user.role}
            size="xl"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {fullName(user.first_name, user.last_name)}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <RoleLabel role={user.role} />
              <span>·</span>
              <StatusBadge status={user.status} />
            </div>
          </div>
        </div>

        <UserActions userId={user.id} status={user.status as Status}>
          <EditUserDialog
            user={{
              id: user.id,
              first_name: user.first_name ?? "",
              last_name: user.last_name ?? "",
              phone: user.phone ?? "",
              email,
              role: user.role,
              branch_id: user.branch_id,
              commission_percent: user.commission_percent
                ? Number(user.commission_percent)
                : null,
              commission_conditions: user.commission_conditions ?? "",
              can_export_leads: user.can_export_leads ?? false,
            }}
            branches={branches}
          />
        </UserActions>
      </header>

      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <ContactRow icon={Mail} label="Email" value={email} />
        <ContactRow icon={Phone} label="Teléfono" value={user.phone} />
        <ContactRow
          icon={ShieldCheck}
          label="Sucursal"
          value={
            user.branch_id
              ? (branches.find((b) => b.id === user.branch_id)?.name ?? "—")
              : "—"
          }
        />
      </Card>

      {isManager && teamStats && (
        <ManagerView stats={teamStats} />
      )}

      {isVendor && vendorStats && <VendorView stats={vendorStats} />}

      {isProvider && providerStats && <ProviderView stats={providerStats} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Manager view
// ────────────────────────────────────────────────────────────────

type TeamMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: Status;
  email: string;
  activeLeads: number;
  salesAccepted: number;
};

async function loadManagerStats({
  managerId,
  companyId,
  emails,
}: {
  managerId: string;
  companyId: string;
  branches: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
  emails: { id: string; email?: string | null }[];
}) {
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { data: managements },
    { data: team },
    { data: leads },
    { data: sales },
  ] = await Promise.all([
    supabase
      .from("managements")
      .select(
        "branch_id, product_type_id, auto_assignment_enabled, branch:branches!branch_id (name), product_type:product_types!product_type_id (name)",
      )
      .eq("manager_id", managerId),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status")
      .eq("manager_id", managerId)
      .eq("role", "sales")
      .neq("status", "deleted"),
    supabase
      .from("leads")
      .select("id, status, assigned_user_id, branch_id, product_type_id")
      .eq("company_id", companyId),
    supabase
      .from("sales")
      .select("id, status, vendor_id, final_price, started_at")
      .eq("company_id", companyId),
  ]);

  const gerencias = new Set<string>();
  for (const m of managements ?? []) {
    gerencias.add(`${m.branch_id}|${m.product_type_id}`);
  }

  const teamMembers = team ?? [];
  const teamIds = new Set(teamMembers.map((m) => m.id));
  const emailById = new Map<string, string>();
  for (const e of emails) if (e.email) emailById.set(e.id, e.email);

  // Leads activos / pendientes en la gerencia.
  let activeLeads = 0;
  let pendingLeads = 0;
  const activeByVendor = new Map<string, number>();
  for (const l of leads ?? []) {
    if (l.status === "closed") continue;
    if (!l.branch_id || !l.product_type_id) continue;
    if (!gerencias.has(`${l.branch_id}|${l.product_type_id}`)) continue;
    activeLeads++;
    if (!l.assigned_user_id) pendingLeads++;
    if (l.assigned_user_id && teamIds.has(l.assigned_user_id)) {
      activeByVendor.set(
        l.assigned_user_id,
        (activeByVendor.get(l.assigned_user_id) ?? 0) + 1,
      );
    }
  }

  // Ventas del equipo (aceptadas).
  let salesAccepted = 0;
  let salesMonthAmount = 0;
  const salesAcceptedByVendor = new Map<string, number>();
  for (const s of sales ?? []) {
    if (s.status !== "accepted" || !s.vendor_id) continue;
    if (!teamIds.has(s.vendor_id)) continue;
    salesAccepted++;
    salesAcceptedByVendor.set(
      s.vendor_id,
      (salesAcceptedByVendor.get(s.vendor_id) ?? 0) + 1,
    );
    if (s.started_at && new Date(s.started_at) >= monthStart) {
      salesMonthAmount += Number(s.final_price ?? 0);
    }
  }

  const vendors: TeamMember[] = teamMembers.map((m) => ({
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    status: m.status as Status,
    email: emailById.get(m.id) ?? "—",
    activeLeads: activeByVendor.get(m.id) ?? 0,
    salesAccepted: salesAcceptedByVendor.get(m.id) ?? 0,
  }));

  return {
    vendors,
    activeLeads,
    pendingLeads,
    salesAccepted,
    salesMonthAmount,
    managements: (managements ?? []).map((m) => ({
      branch: m.branch?.name ?? "—",
      product_type: m.product_type?.name ?? "—",
      auto: m.auto_assignment_enabled,
    })),
  };
}

function ManagerView({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof loadManagerStats>>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Vendedores"
          value={stats.vendors.length}
          caption="En su equipo"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Ventas"
          value={stats.salesAccepted}
          caption={formatARS(stats.salesMonthAmount) + " este mes"}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Leads activos"
          value={stats.activeLeads}
          caption="En sus gerencias"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Leads pendientes"
          value={stats.pendingLeads}
          caption="Sin asignar todavía"
        />
      </div>

      {stats.managements.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gerencias asignadas
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.managements.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
              >
                <span className="font-medium">{m.branch}</span>
                <span className="text-muted-foreground">·</span>
                <span>{m.product_type}</span>
                <span
                  className={
                    m.auto
                      ? "ml-1 inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success"
                      : "ml-1 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  }
                >
                  {m.auto ? "Auto-asignación ON" : "Auto-asignación OFF"}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
          <h2 className="text-sm font-semibold">
            Equipo de vendedores ({stats.vendors.length})
          </h2>
        </div>
        {stats.vendors.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Todavía no tiene vendedores asignados.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">

            <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 text-center font-medium">
                  Leads activos
                </th>
                <th className="px-4 py-2 text-center font-medium">Ventas</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {stats.vendors.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-border bg-card hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${v.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                        <UserCircle className="size-4" />
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {fullName(v.first_name, v.last_name)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {v.email}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {v.activeLeads}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {v.salesAccepted}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${v.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-card px-3 text-xs hover:bg-muted"
                    >
                      Ver perfil <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Vendor view
// ────────────────────────────────────────────────────────────────

async function loadVendorStats({
  vendorId,
  companyId,
  branches,
  branchId,
  managerId,
  commissionPct,
}: {
  vendorId: string;
  companyId: string;
  branches: { id: string; name: string }[];
  branchId: string | null;
  managerId: string | null;
  commissionPct: number;
}) {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: leads }, { data: sales }, { data: manager }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id, status")
        .eq("assigned_user_id", vendorId)
        .eq("company_id", companyId),
      supabase
        .from("sales")
        .select(
          "id, status, final_price, started_at, commission_percent_snapshot",
        )
        .eq("vendor_id", vendorId)
        .eq("company_id", companyId),
      managerId
        ? supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", managerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const leadsTotal = leads?.length ?? 0;
  const leadsActive =
    leads?.filter((l) => l.status !== "closed").length ?? 0;
  const salesAccepted = sales?.filter((s) => s.status === "accepted").length ?? 0;
  let salesMonthAmount = 0;
  let commissionAccrued = 0;
  for (const s of sales ?? []) {
    if (s.status !== "accepted") continue;
    if (s.started_at && new Date(s.started_at) >= monthStart) {
      salesMonthAmount += Number(s.final_price ?? 0);
    }
    const pct =
      s.commission_percent_snapshot !== null
        ? Number(s.commission_percent_snapshot)
        : commissionPct;
    commissionAccrued += (Number(s.final_price ?? 0) * pct) / 100;
  }

  return {
    leadsActive,
    leadsTotal,
    salesAccepted,
    salesMonthAmount,
    commissionAccrued,
    branchName: branchId
      ? (branches.find((b) => b.id === branchId)?.name ?? null)
      : null,
    managerName: manager
      ? fullName(manager.first_name, manager.last_name)
      : null,
  };
}

function VendorView({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof loadVendorStats>>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Leads activos"
          value={stats.leadsActive}
          caption={`${stats.leadsTotal} en total`}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Ventas aceptadas"
          value={stats.salesAccepted}
          caption={formatARS(stats.salesMonthAmount) + " este mes"}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Comisión acumulada"
          value={formatARS(stats.commissionAccrued)}
          caption="Todas las ventas aceptadas"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Reporta a"
          value={stats.managerName ?? "—"}
          caption={stats.branchName ?? "Sin sucursal"}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Provider view
// ────────────────────────────────────────────────────────────────

async function loadProviderStats({
  providerId,
  companyId,
}: {
  providerId: string;
  companyId: string;
}) {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, status, branch_id, product_type_id")
    .eq("created_by", providerId)
    .eq("company_id", companyId);

  const list = leads ?? [];
  return {
    leadsTotal: list.length,
    leadsActive: list.filter((l) => l.status !== "closed").length,
    leadsPool: list.filter(
      (l) => l.status === "new" && (!l.branch_id || !l.product_type_id),
    ).length,
  };
}

function ProviderView({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof loadProviderStats>>>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCard
        icon={Truck}
        label="Total cargados"
        value={stats.leadsTotal}
        caption="Histórico"
      />
      <KpiCard
        icon={Truck}
        label="Leads activos"
        value={stats.leadsActive}
        caption="Sin cerrar"
      />
      <KpiCard
        icon={Truck}
        label="Pendientes en pool"
        value={stats.leadsPool}
        caption="Sin clasificar"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

type Status = "pending" | "active" | "inactive" | "deleted";

const STATUS_CFG: Record<Status, { label: string; cls: string }> = {
  active: { label: "Activo", cls: "bg-success/10 text-success" },
  pending: { label: "Pendiente", cls: "bg-warning/10 text-warning-foreground" },
  inactive: { label: "Inactivo", cls: "bg-muted text-muted-foreground" },
  deleted: { label: "Eliminado", cls: "bg-destructive/10 text-destructive" },
};

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function RoleLabel({ role }: { role: string }) {
  const map: Record<string, string> = {
    super_admin: "SuperAdmin",
    admin: "Admin",
    manager: "Gerente de ventas",
    sales: "Vendedor",
    data_provider: "Proveedor de datos",
  };
  return <span>{map[role] ?? role}</span>;
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

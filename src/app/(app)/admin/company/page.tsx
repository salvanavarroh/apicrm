import {
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  PencilLine,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { planLabel } from "@/lib/plans";

import { CallCenterSettingsCard } from "@/components/inbox/call-center-settings";

import { BranchCardActions } from "./branch-card-actions";
import { EditCompanyDialog } from "./edit-company-dialog";
import { RequestBranchDialog } from "./request-branch-dialog";

export default async function AdminCompanyPage() {
  const profile = await requireRole(["admin"]);

  if (!profile.company_id) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Mi empresa</h1>
        <p className="text-sm text-muted-foreground">
          No tenés empresa asignada.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    companyRes,
    branchesRes,
    profilesRes,
    requestsRes,
    leadsRes,
    salesRes,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, legal_name, cuit, phone, address, logo_url, quote_legal_text, quote_hide_name, plan, monthly_price, subscription_starts_at, subscription_ends_at, status, created_at, inbox_max_open_per_vendor, inbox_hours_enabled, inbox_hours_start, inbox_hours_end, inbox_hours_days",
      )
      .eq("id", profile.company_id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, address, phone, status")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role, status, branch_id, manager_id")
      .eq("company_id", profile.company_id)
      .neq("status", "deleted"),
    supabase
      .from("branch_requests")
      .select("id, name, address, city, status, decision_note")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("leads")
      .select("id, status, branch_id")
      .eq("company_id", profile.company_id),
    supabase
      .from("sales")
      .select("id, status, lead_id, started_at")
      .eq("company_id", profile.company_id)
      .gte("started_at", monthStart.toISOString()),
  ]);

  if (!companyRes.data) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Mi empresa</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar los datos de tu empresa.
        </p>
      </div>
    );
  }

  const company = companyRes.data;
  const branches = branchesRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const requests = requestsRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const salesMonth = salesRes.data ?? [];

  // Por sucursal: leads activos (≠ closed) y ventas aceptadas del mes.
  const activeLeadsByBranch = new Map<string, number>();
  for (const l of leads) {
    if (!l.branch_id || l.status === "closed") continue;
    activeLeadsByBranch.set(
      l.branch_id,
      (activeLeadsByBranch.get(l.branch_id) ?? 0) + 1,
    );
  }
  // sales no tiene branch_id directo — joineamos vía lead_id contra leads.
  const branchByLead = new Map<string, string>();
  for (const l of leads) {
    if (l.branch_id) branchByLead.set(l.id, l.branch_id);
  }
  const salesAcceptedByBranch = new Map<string, number>();
  for (const s of salesMonth) {
    if (s.status !== "accepted") continue;
    const branchId = branchByLead.get(s.lead_id);
    if (!branchId) continue;
    salesAcceptedByBranch.set(
      branchId,
      (salesAcceptedByBranch.get(branchId) ?? 0) + 1,
    );
  }

  const admins = profiles.filter((p) => p.role === "admin");
  const managers = profiles.filter((p) => p.role === "manager");
  const sellers = profiles.filter((p) => p.role === "sales");
  const providers = profiles.filter((p) => p.role === "data_provider");
  const primaryAdmin = admins.find((a) => a.id === profile.id) ?? admins[0];

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const hasPendingRequest = pendingRequests.length > 0;

  // Tasa de conversión: placeholder Sprint 7 (sin ventas todavía)
  const conversionRate = "—";

  // Email del admin actual
  const { data: usersData } = await createAdminClient().auth.admin.listUsers({
    perPage: 1000,
  });
  const me = usersData.users.find((u) => u.id === profile.id);
  const myEmail = me?.email ?? "—";
  const adminFullName = primaryAdmin
    ? `${primaryAdmin.first_name} ${primaryAdmin.last_name}`.trim() || "—"
    : "—";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          <div className="flex flex-col gap-1 border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Admin:</strong>{" "}
              <a
                href="/profile"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                {adminFullName}
              </a>{" "}
              · {myEmail}
            </p>
            {company.address && (
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {company.address}
              </p>
            )}
            <p className="text-xs">
              Alta:{" "}
              {company.subscription_starts_at
                ? new Date(company.subscription_starts_at).toLocaleDateString(
                    "es-AR",
                    { day: "numeric", month: "short", year: "numeric" },
                  )
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditCompanyDialog
            initial={{
              name: company.name,
              phone: company.phone,
              address: company.address,
              logo_url: company.logo_url,
              quote_legal_text: company.quote_legal_text,
              quote_hide_name: company.quote_hide_name,
            }}
            trigger={
              <Button variant="outline" size="icon" aria-label="Editar empresa">
                <PencilLine className="size-4" />
              </Button>
            }
          />
          <Button variant="outline" asChild>
            <Link href="/admin/users">Ver lista de usuarios</Link>
          </Button>
          {hasPendingRequest && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              {pendingRequests.length === 1
                ? "1 solicitud pendiente"
                : `${pendingRequests.length} solicitudes pendientes`}
            </span>
          )}
          <RequestBranchDialog
            trigger={
              <Button>
                Solicitar nueva sucursal{" "}
                <span aria-hidden className="ml-1">
                  ›
                </span>
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <KpiCard
          icon={TrendingUp}
          label="Tasa de conversión"
          value={conversionRate}
          caption="Tasa de conversión mensual"
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
              Todavía no tenés sucursales. Solicitá la primera al SuperAdmin.
            </p>
            <RequestBranchDialog
              trigger={
                <Button variant="outline" size="sm">
                  Solicitar sucursal
                </Button>
              }
            />
          </Card>
        ) : (
          branches.map((b) => {
            const branchSellers = sellers.filter((s) => s.branch_id === b.id);
            const branchManagers = managers; // Gerentes de la empresa (no scoped por sucursal acá)
            const branchLeadsActive = activeLeadsByBranch.get(b.id) ?? 0;
            const branchSalesMonth = salesAcceptedByBranch.get(b.id) ?? 0;
            return (
              <Card
                key={b.id}
                className="flex flex-col gap-4 p-5 transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    href={`/admin/branches/${b.id}`}
                    className="flex flex-col gap-1.5 hover:[&_.branch-name]:underline"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-foreground" />
                      <span className="branch-name text-lg font-semibold">
                        {b.name}
                      </span>
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
                    <p className="flex items-center gap-1.5 text-sm">
                      <Users className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Admin:</span>{" "}
                      <span className="font-medium">{adminFullName}</span>
                    </p>
                  </Link>

                  <BranchCardActions branch={b} />
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <BranchStat
                    icon={UserPlus}
                    label="Proveedores de datos"
                    value={providers.length}
                    caption="Cantidad de proveedores"
                  />
                  <BranchStat
                    icon={UserCog}
                    label="Gerentes"
                    value={branchManagers.length}
                    caption="Cantidad de gerentes"
                  />
                  <BranchStat
                    icon={Users}
                    label="Vendedores"
                    value={branchSellers.length}
                    caption="Cantidad de vendedores"
                  />
                  <BranchStat
                    icon={Wallet}
                    label="Leads activos"
                    value={branchLeadsActive}
                    caption="Sin cerrar"
                  />
                  <BranchStat
                    icon={ShoppingBag}
                    label="Ventas del mes"
                    value={branchSalesMonth}
                    caption="Aceptadas en el mes"
                  />
                </div>
              </Card>
            );
          })
        )}

        {requests.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Historial de solicitudes
            </h3>
            {requests.map((r) => (
              <Card
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.city, r.address].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="flex h-fit flex-col gap-2 p-5">
        <h3 className="text-lg font-semibold">Datos legales</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Razón social" value={company.legal_name} />
          <Field label="CUIT" value={company.cuit} />
          <Field label="Plan" value={planLabel(company.plan)} />
          <Field
            label="Precio mensual"
            value={
              company.monthly_price !== null ? formatARS(company.monthly_price) : null
            }
          />
          <Field
            label="Fecha de alta"
            value={company.subscription_starts_at}
          />
          <Field label="Vencimiento" value={company.subscription_ends_at} />
          <Field label="Estado" value={company.status} />
        </div>
        <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Para modificar estos datos contactá al SuperAdmin.
        </p>
      </Card>

      <CallCenterSettingsCard
        initial={{
          maxOpenPerVendor: company.inbox_max_open_per_vendor,
          hoursEnabled: company.inbox_hours_enabled,
          hoursStart: company.inbox_hours_start?.slice(0, 5) ?? null,
          hoursEnd: company.inbox_hours_end?.slice(0, 5) ?? null,
          hoursDays: company.inbox_hours_days ?? [],
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
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
        <p className="text-[10px] text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected" | "canceled";
}) {
  const map = {
    pending: {
      label: "Pendiente",
      cls: "bg-warning/10 text-warning-foreground",
      icon: Clock,
    },
    approved: {
      label: "Aprobada",
      cls: "bg-success/10 text-success",
      icon: CheckCircle2,
    },
    rejected: {
      label: "Rechazada",
      cls: "bg-destructive/10 text-destructive",
      icon: XCircle,
    },
    canceled: {
      label: "Cancelada",
      cls: "bg-muted text-muted-foreground",
      icon: XCircle,
    },
  } as const;
  const s = map[status];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <Icon className="size-3" /> {s.label}
    </span>
  );
}

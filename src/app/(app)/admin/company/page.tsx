import {
  Building2,
  MapPin,
  PencilLine,
  Phone,
  ShieldCheck,
  Store,
  UserCog,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { EditCompanyDialog } from "./edit-company-dialog";

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
  const [companyRes, branchesRes, profilesRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, legal_name, cuit, phone, address, logo_url, monthly_price, subscription_ends_at, status, created_at",
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
      .select("id, role, status")
      .eq("company_id", profile.company_id)
      .neq("status", "deleted"),
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

  const adminsCount = profiles.filter((p) => p.role === "admin").length;
  const managersCount = profiles.filter((p) => p.role === "manager").length;
  const sellersCount = profiles.filter((p) => p.role === "sales").length;

  // Email del admin principal (= el caller en muchos casos)
  let primaryAdminEmail = "—";
  const { data: usersData } = await createAdminClient().auth.admin.listUsers({
    perPage: 1000,
  });
  const me = usersData.users.find((u) => u.id === profile.id);
  primaryAdminEmail = me?.email ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          <div className="flex flex-col gap-1 border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Admin:</strong>{" "}
              {profile.first_name} {profile.last_name} · {primaryAdminEmail}
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
          <EditCompanyDialog
            initial={{
              name: company.name,
              phone: company.phone,
              address: company.address,
              logo_url: company.logo_url,
            }}
            trigger={
              <Button variant="outline" size="icon" aria-label="Editar empresa">
                <PencilLine className="size-4" />
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
          caption="Cantidad de sucursales"
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
          value={sellersCount}
          caption="Cantidad de vendedores"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">
            Sucursales ({branches.length})
          </h2>
          {branches.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <Store className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Cargá tu primera sucursal desde el menú lateral.
              </p>
            </Card>
          ) : (
            branches.map((b) => (
              <Card key={b.id} className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-foreground" />
                  <span className="text-base font-semibold">{b.name}</span>
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
              </Card>
            ))
          )}
        </div>

        <Card className="flex h-fit flex-col gap-3 p-5">
          <h3 className="text-lg font-semibold">Datos legales</h3>
          <Field label="Razón social" value={company.legal_name} />
          <Field label="CUIT" value={company.cuit} />
          <Field
            label="Precio mensual"
            value={
              company.monthly_price !== null
                ? `$${company.monthly_price}`
                : null
            }
          />
          <Field label="Vencimiento" value={company.subscription_ends_at} />
          <Field label="Estado" value={company.status} />
          <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Para modificar estos datos contactá al SuperAdmin.
          </p>
        </Card>
      </div>
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

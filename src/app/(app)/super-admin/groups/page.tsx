import {
  GroupsView,
  type FreeCompany,
  type GroupRow,
} from "@/app/(app)/super-admin/groups/groups-view";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SuperAdminGroupsPage() {
  await requireRole(["super_admin"]);
  const admin = createAdminClient();

  const [{ data: groups }, { data: companies }, { data: admins }] =
    await Promise.all([
      admin
        .from("groups")
        .select(
          "id, name, legal_name, cuit, monthly_price, billing_contact_name, billing_email",
        )
        .order("name"),
      admin.from("companies").select("id, name, group_id").order("name"),
      admin
        .from("profiles")
        .select("id, first_name, last_name, status, group_id")
        .eq("role", "group_admin"),
    ]);

  const rows: GroupRow[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    legalName: g.legal_name,
    cuit: g.cuit,
    monthlyPrice: Number(g.monthly_price ?? 0),
    billingContactName: g.billing_contact_name,
    billingEmail: g.billing_email,
    brands: (companies ?? [])
      .filter((c) => c.group_id === g.id)
      .map((c) => ({ id: c.id, name: c.name })),
    admins: (admins ?? [])
      .filter((p) => p.group_id === g.id)
      .map((p) => ({
        id: p.id,
        name: fullName(p.first_name, p.last_name) || "(sin nombre)",
        status: p.status,
      })),
  }));

  // Sólo las concesionarias sueltas se pueden agregar a un grupo: una marca no
  // puede estar en dos grupos a la vez.
  const freeCompanies: FreeCompany[] = (companies ?? [])
    .filter((c) => c.group_id === null)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Grupos</h1>
        <p className="text-sm text-muted-foreground">
          Un cliente con varias marcas: una sola cuenta con acceso de Admin a
          todas sus concesionarias, y un contrato único.
        </p>
      </header>

      <GroupsView groups={rows} freeCompanies={freeCompanies} />
    </div>
  );
}

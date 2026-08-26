import { Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { InviteUserDialog } from "./invite-user-dialog";
import { UsersTable, type UsersTableRow } from "./users-table";

export default async function AdminUsersPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [
    usersRes,
    branchesRes,
    ptsRes,
    leadsRes,
    salesRes,
    emailsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, role, status, phone, branch_id, manager_id, avatar_url",
      )
      .eq("company_id", profile.company_id)
      .neq("status", "deleted")
      .neq("role", "super_admin"),
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id)
      .order("name"),
    supabase
      .from("product_types")
      .select("id, name")
      .eq("company_id", profile.company_id)
      .order("name"),
    supabase
      .from("leads")
      .select(
        "id, status, assigned_user_id, branch_id, product_type_id, created_by",
      )
      .eq("company_id", profile.company_id),
    supabase
      .from("sales")
      .select("id, status, vendor_id")
      .eq("company_id", profile.company_id),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const allUsers = usersRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const sales = salesRes.data ?? [];

  const emailMap: Record<string, string> = {};
  for (const u of emailsRes.data.users) {
    if (u.email) emailMap[u.id] = u.email;
  }

  // Mostrar solo Gerentes y Proveedores en la lista.
  const visibleUsers = allUsers.filter(
    (u) => u.role === "manager" || u.role === "data_provider",
  );

  // Para cada Manager: vendedores bajo manager_id + ventas aceptadas + leads
  // activos/pendientes en sus gerencias (match branch+product_type).
  // Para eso necesitamos sus combinaciones (branch_id, product_type_id) — las
  // sacamos de las gerencias activas.
  const managerIds = visibleUsers
    .filter((u) => u.role === "manager")
    .map((u) => u.id);
  const { data: managementsRows } = await supabase
    .from("managements")
    .select("manager_id, branch_id, product_type_id")
    .in("manager_id", managerIds.length > 0 ? managerIds : ["00000000-0000-0000-0000-000000000000"]);

  // Mapa: manager_id → Set("branch_id|product_type_id")
  const gerenciasByManager = new Map<string, Set<string>>();
  for (const m of managementsRows ?? []) {
    const k = `${m.branch_id}|${m.product_type_id}`;
    if (!gerenciasByManager.has(m.manager_id))
      gerenciasByManager.set(m.manager_id, new Set());
    gerenciasByManager.get(m.manager_id)!.add(k);
  }

  // Vendedores agrupados por manager_id.
  const vendorsByManager = new Map<string, number>();
  for (const u of allUsers) {
    if (u.role === "sales" && u.manager_id && u.status !== "deleted") {
      vendorsByManager.set(
        u.manager_id,
        (vendorsByManager.get(u.manager_id) ?? 0) + 1,
      );
    }
  }

  // Sales aceptadas por vendor_id, luego mapeamos al manager.
  const vendorManagerLookup = new Map<string, string>(); // sales user id → manager id
  for (const u of allUsers) {
    if (u.role === "sales" && u.manager_id) {
      vendorManagerLookup.set(u.id, u.manager_id);
    }
  }
  const salesAcceptedByManager = new Map<string, number>();
  for (const s of sales) {
    if (s.status !== "accepted" || !s.vendor_id) continue;
    const mgr = vendorManagerLookup.get(s.vendor_id);
    if (!mgr) continue;
    salesAcceptedByManager.set(mgr, (salesAcceptedByManager.get(mgr) ?? 0) + 1);
  }

  // Leads activos (status ≠ closed) y pendientes (sin assigned_user_id) por
  // manager, matcheando branch+pt.
  const activeLeadsByManager = new Map<string, number>();
  const pendingLeadsByManager = new Map<string, number>();
  for (const l of leads) {
    if (l.status === "closed") continue;
    if (!l.branch_id || !l.product_type_id) continue;
    const k = `${l.branch_id}|${l.product_type_id}`;
    for (const [mgrId, set] of gerenciasByManager.entries()) {
      if (!set.has(k)) continue;
      activeLeadsByManager.set(mgrId, (activeLeadsByManager.get(mgrId) ?? 0) + 1);
      if (!l.assigned_user_id) {
        pendingLeadsByManager.set(
          mgrId,
          (pendingLeadsByManager.get(mgrId) ?? 0) + 1,
        );
      }
    }
  }

  // Para Proveedores: leads creados por ellos.
  const providerLeadsPending = new Map<string, number>(); // pool: status=new + sin branch/pt
  const providerLeadsActive = new Map<string, number>(); // todos los suyos no cerrados
  for (const l of leads) {
    if (!l.created_by) continue;
    if (l.status === "closed") continue;
    providerLeadsActive.set(
      l.created_by,
      (providerLeadsActive.get(l.created_by) ?? 0) + 1,
    );
    if (l.status === "new" && (!l.branch_id || !l.product_type_id)) {
      providerLeadsPending.set(
        l.created_by,
        (providerLeadsPending.get(l.created_by) ?? 0) + 1,
      );
    }
  }

  // Resolver sucursales asociadas a cada usuario visible. Gerente: vía
  // managements (branches que maneja). Proveedor: no tiene scope por
  // sucursal, no se filtra por branch (se muestra siempre).
  const branchesByManager = new Map<string, Set<string>>();
  for (const m of managementsRows ?? []) {
    if (!branchesByManager.has(m.manager_id))
      branchesByManager.set(m.manager_id, new Set());
    branchesByManager.get(m.manager_id)!.add(m.branch_id);
  }

  // Tipos de producto por gerente (para constreñir el form del vendedor).
  const productTypesByManager = new Map<string, Set<string>>();
  for (const m of managementsRows ?? []) {
    if (!productTypesByManager.has(m.manager_id))
      productTypesByManager.set(m.manager_id, new Set());
    productTypesByManager.get(m.manager_id)!.add(m.product_type_id);
  }

  // Nombres de tipos de producto por gerente, para mostrar el detalle del rol
  // (ej. "Gerente de ventas · 0km, Usados").
  const ptNameById = new Map(productTypes.map((pt) => [pt.id, pt.name]));
  const productTypeNamesByManager = new Map<string, string[]>();
  for (const [mid, set] of productTypesByManager.entries()) {
    productTypeNamesByManager.set(
      mid,
      [...set]
        .map((id) => ptNameById.get(id))
        .filter((n): n is string => Boolean(n))
        .sort((a, b) => a.localeCompare(b)),
    );
  }

  // Leads activos asignados a cada vendedor.
  const sellerActiveLeads = new Map<string, number>();
  for (const l of leads) {
    if (l.status === "closed" || !l.assigned_user_id) continue;
    sellerActiveLeads.set(
      l.assigned_user_id,
      (sellerActiveLeads.get(l.assigned_user_id) ?? 0) + 1,
    );
  }

  // Vendedores agrupados bajo su gerente (para mostrarlos debajo de cada uno).
  const vendorsListByManager = new Map<
    string,
    NonNullable<UsersTableRow["vendorsList"]>
  >();
  for (const u of allUsers) {
    if (u.role !== "sales" || !u.manager_id) continue;
    const arr = vendorsListByManager.get(u.manager_id) ?? [];
    arr.push({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: emailMap[u.id] ?? "—",
      status: u.status as UsersTableRow["status"],
      avatarUrl: u.avatar_url ?? null,
      branchId: u.branch_id ?? null,
      activeLeads: sellerActiveLeads.get(u.id) ?? 0,
    });
    vendorsListByManager.set(u.manager_id, arr);
  }

  // Gerentes activos disponibles para asignar vendedores.
  const managersForInvite = allUsers
    .filter((u) => u.role === "manager" && u.status === "active")
    .map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Gerente",
      branchIds: Array.from(branchesByManager.get(u.id) ?? []),
      productTypeIds: Array.from(productTypesByManager.get(u.id) ?? []),
    }));

  const rows: UsersTableRow[] = visibleUsers.map((u) => {
    const isManager = u.role === "manager";
    // Provider: pasa array vacío → solo aparece con filtro "Todas".
    // Manager: array con sus branches (vía managements).
    // Si querés que provider siga apareciendo al filtrar por sucursal,
    // pasale TODAS las branches del company.
    const branchIds = isManager
      ? Array.from(branchesByManager.get(u.id) ?? [])
      : branches.map((b) => b.id);
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role as "manager" | "data_provider",
      status: u.status as UsersTableRow["status"],
      email: emailMap[u.id] ?? "—",
      phone: u.phone,
      avatarUrl: u.avatar_url ?? null,
      vendors: isManager ? (vendorsByManager.get(u.id) ?? 0) : null,
      sales: isManager ? (salesAcceptedByManager.get(u.id) ?? 0) : null,
      activeLeads: isManager
        ? (activeLeadsByManager.get(u.id) ?? 0)
        : (providerLeadsActive.get(u.id) ?? 0),
      pendingLeads: isManager
        ? (pendingLeadsByManager.get(u.id) ?? 0)
        : (providerLeadsPending.get(u.id) ?? 0),
      productTypeNames: isManager
        ? (productTypeNamesByManager.get(u.id) ?? [])
        : [],
      vendorsList: isManager ? (vendorsListByManager.get(u.id) ?? []) : [],
      branchIds,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Gerentes de ventas (con sus vendedores) y proveedores de datos.
            Expandí un gerente para ver su equipo, o filtrá por “Vendedores”.
          </p>
        </div>
        <InviteUserDialog
          branches={branches}
          productTypes={productTypes}
          managers={managersForInvite}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Crear usuario
            </Button>
          }
        />
      </header>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <UsersRound className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no invitaste gerentes ni proveedores.
          </p>
        </Card>
      ) : (
        <UsersTable rows={rows} branches={branches} />
      )}
    </div>
  );
}

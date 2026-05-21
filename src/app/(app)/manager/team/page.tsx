import { Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { InviteSellerDialog } from "./invite-seller-dialog";
import { SellerRowActions } from "./seller-row-actions";

export default async function ManagerTeamPage() {
  const profile = await requireRole(["manager"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();

  // Gerencias del manager → branches + product_types disponibles para
  // armar el form del nuevo vendedor.
  const { data: managements } = await supabase
    .from("managements")
    .select(
      "branch_id, product_type_id, branches(id, name), product_types(id, name)",
    )
    .eq("manager_id", profile.id);

  const branchesMap = new Map<
    string,
    { id: string; name: string; productTypes: { id: string; name: string }[] }
  >();
  for (const m of managements ?? []) {
    const branch = (m.branches ?? null) as { id: string; name: string } | null;
    const pt = (m.product_types ?? null) as { id: string; name: string } | null;
    if (!branch || !pt) continue;
    if (!branchesMap.has(branch.id)) {
      branchesMap.set(branch.id, {
        id: branch.id,
        name: branch.name,
        productTypes: [],
      });
    }
    branchesMap.get(branch.id)!.productTypes.push(pt);
  }
  const branches = Array.from(branchesMap.values());

  // Vendedores del manager.
  const { data: sellers } = await supabase
    .from("profiles")
    .select(
      "id, first_name, last_name, status, branch_id, commission_percent, commission_conditions, branches(name)",
    )
    .eq("manager_id", profile.id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  const list = sellers ?? [];

  // Emails desde service-role
  const emailMap = new Map<string, string>();
  const { data: usersData } = await createAdminClient().auth.admin.listUsers({
    perPage: 1000,
  });
  for (const u of usersData.users) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Equipo</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Invitá vendedores a tu gerencia y configurá su comisión y tipos
            asignados.
          </p>
        </div>
        <InviteSellerDialog
          branches={branches}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Invitar vendedor
            </Button>
          }
        />
      </header>

      {list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Users className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no invitaste vendedores.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Comisión</th>
                <th className="px-4 py-3 font-medium">Condiciones</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const branch = (s.branches ?? null) as { name: string } | null;
                const name =
                  `${s.first_name} ${s.last_name}`.trim() || "(sin nombre)";
                return (
                  <tr key={s.id} className="border-t border-border bg-background hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {emailMap.get(s.id) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {branch?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.commission_percent !== null
                        ? `${s.commission_percent}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {s.commission_conditions ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          s.status === "active"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : s.status === "pending"
                              ? "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground"
                              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {s.status === "active"
                          ? "Activo"
                          : s.status === "pending"
                            ? "Pendiente"
                            : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SellerRowActions userId={s.id} status={s.status} />
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

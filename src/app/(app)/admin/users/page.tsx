import { Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { InviteUserDialog, ROLE_LABELS, type Role } from "./invite-user-dialog";
import { UserRowActions } from "./user-row-actions";

const STATUS_STYLES: Record<
  "pending" | "active" | "inactive" | "deleted",
  string
> = {
  active: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning-foreground",
  inactive: "bg-muted text-muted-foreground",
  deleted: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<
  "pending" | "active" | "inactive" | "deleted",
  string
> = {
  active: "Activo",
  pending: "Pendiente",
  inactive: "Inactivo",
  deleted: "Eliminado",
};

export default async function AdminUsersPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();

  const [usersRes, branchesRes, ptsRes, emailsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role, status, phone, branch_id")
      .neq("status", "deleted")
      .neq("role", "super_admin")
      .order("created_at", { ascending: false }),
    supabase
      .from("branches")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("product_types")
      .select("id, name")
      .order("name", { ascending: true }),
    // service-role para leer emails de auth.users (RLS no expone esa tabla)
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const users = usersRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const emailMap = new Map<string, string>();
  for (const u of emailsRes.data.users) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Invitá Admins, Gerentes y Proveedores de datos. Los Vendedores los
            invita cada Gerente desde su panel.
          </p>
        </div>
        <InviteUserDialog
          branches={branches}
          productTypes={productTypes}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Invitar usuario
            </Button>
          }
        />
      </header>

      {users.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <UsersRound className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no invitaste a nadie.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const name =
                  `${u.first_name} ${u.last_name}`.trim() || "(sin nombre)";
                const branch = u.branch_id
                  ? branches.find((b) => b.id === u.branch_id)?.name
                  : null;
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {emailMap.get(u.id) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ROLE_LABELS[u.role as Role] ?? u.role}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {branch ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status]}`}
                      >
                        {STATUS_LABELS[u.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <UserRowActions
                        userId={u.id}
                        fullName={name}
                        status={u.status}
                        isSelf={u.id === profile.id}
                      />
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

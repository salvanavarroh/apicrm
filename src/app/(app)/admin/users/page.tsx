import { Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { InviteUserDialog } from "./invite-user-dialog";
import { UsersTable } from "./users-table";

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
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const users = usersRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];
  const emailMap: Record<string, string> = {};
  for (const u of emailsRes.data.users) {
    if (u.email) emailMap[u.id] = u.email;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Visualizá y administrá los usuarios, sus roles y el rendimiento
            comercial de cada uno.
          </p>
        </div>
        <InviteUserDialog
          branches={branches}
          productTypes={productTypes}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Crear usuario
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
        <UsersTable
          users={users}
          branches={branches}
          emailMap={emailMap}
          currentUserId={profile.id}
        />
      )}
    </div>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";

import { ROLE_LABELS, type Role } from "./invite-user-dialog";
import { UserDetailDialog } from "./user-detail-dialog";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  status: "pending" | "active" | "inactive" | "deleted";
  phone: string | null;
  branch_id: string | null;
};

const STATUS_STYLES = {
  active: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning-foreground",
  inactive: "bg-muted text-muted-foreground",
  deleted: "bg-destructive/10 text-destructive",
} as const;
const STATUS_LABELS = {
  active: "Activo",
  pending: "Pendiente",
  inactive: "Inactivo",
  deleted: "Eliminado",
} as const;

export function UsersTable({
  users,
  branches,
  emailMap,
  currentUserId,
}: {
  users: Row[];
  branches: { id: string; name: string }[];
  emailMap: Record<string, string>;
  currentUserId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  return (
    <>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Sucursal</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const name =
                `${u.first_name} ${u.last_name}`.trim() || "(sin nombre)";
              const branch = u.branch_id
                ? branches.find((b) => b.id === u.branch_id)?.name ?? null
                : null;
              const email = emailMap[u.id] ?? "—";
              return (
                <tr
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className="cursor-pointer border-t border-border hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium">{name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{email}</td>
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
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {selected && (
        <UserDetailDialog
          key={selected.id}
          open
          onOpenChange={(next) => !next && setSelectedId(null)}
          user={{
            id: selected.id,
            fullName:
              `${selected.first_name} ${selected.last_name}`.trim() ||
              "(sin nombre)",
            email: emailMap[selected.id] ?? "—",
            phone: selected.phone,
            role: selected.role as Role | "sales" | "super_admin",
            status: selected.status,
            branchName: selected.branch_id
              ? branches.find((b) => b.id === selected.branch_id)?.name ?? null
              : null,
            isSelf: selected.id === currentUserId,
          }}
        />
      )}
    </>
  );
}

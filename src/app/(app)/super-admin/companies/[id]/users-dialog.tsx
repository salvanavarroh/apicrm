"use client";

import { Users } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ImpersonateButton } from "@/components/impersonate-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Role = "admin" | "manager" | "sales" | "data_provider";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Gerente",
  sales: "Vendedor",
  data_provider: "Proveedor",
};

const ROLE_ORDER: Role[] = ["admin", "manager", "sales", "data_provider"];

type Status = "pending" | "active" | "inactive" | "deleted";
const STATUS_LABEL: Record<Status, string> = {
  pending: "Pendiente",
  active: "Activo",
  inactive: "Inactivo",
  deleted: "Eliminado",
};
const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive"> =
  {
    active: "default",
    pending: "secondary",
    inactive: "secondary",
    deleted: "destructive",
  };

export type CompanyUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: Role;
  status: Status;
  branch_name: string | null;
};

type Props = {
  trigger: ReactNode;
  companyName: string;
  users: CompanyUser[];
};

export function UsersDialog({ trigger, companyName, users }: Props) {
  const [open, setOpen] = useState(false);
  const grouped = ROLE_ORDER.map((role) => ({
    role,
    items: users.filter((u) => u.role === role),
  })).filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Usuarios de {companyName}
          </DialogTitle>
          <DialogDescription>
            Total: {users.length} usuario{users.length === 1 ? "" : "s"}.
            Listado completo por rol.
          </DialogDescription>
        </DialogHeader>

        {users.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            La concesionaria no tiene usuarios cargados todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(({ role, items }) => (
              <section key={role} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Sucursal</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((u) => (
                        <tr
                          key={u.id}
                          className="border-t border-border bg-card"
                        >
                          <td className="px-3 py-2 font-medium">
                            {fullName(u.first_name, u.last_name)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {u.email}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {u.branch_name ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={STATUS_VARIANT[u.status]}>
                              {STATUS_LABEL[u.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {(u.role === "admin" || u.role === "manager") &&
                              u.status === "active" && (
                                <ImpersonateButton userId={u.id} />
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fullName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return [f, l].filter(Boolean).join(" ") || "(sin nombre)";
}

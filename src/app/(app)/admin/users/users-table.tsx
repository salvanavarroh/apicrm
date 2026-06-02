"use client";

import { ChevronRight, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type UsersTableRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: "manager" | "data_provider";
  status: "pending" | "active" | "inactive" | "deleted";
  email: string;
  phone: string | null;
  vendors: number | null;
  sales: number | null;
  activeLeads: number;
  pendingLeads: number;
};

const STATUS_CFG = {
  active: { label: "Activo", cls: "bg-success/10 text-success" },
  pending: { label: "Pendiente", cls: "bg-warning/10 text-warning-foreground" },
  inactive: { label: "Inactivo", cls: "bg-muted text-muted-foreground" },
  deleted: { label: "Eliminado", cls: "bg-destructive/10 text-destructive" },
} as const;

const ROLE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "manager", label: "Gerentes" },
  { value: "data_provider", label: "Proveedores" },
];

export function UsersTable({ rows }: { rows: UsersTableRow[] }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (!q) return true;
      const hay = [r.firstName, r.lastName, r.email, r.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, roleFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Buscar por nombre o email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rows.length}
        </span>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 text-center font-medium">Vendedores</th>
              <th className="px-4 py-3 text-center font-medium">Ventas</th>
              <th className="px-4 py-3 text-center font-medium">
                Leads activos
              </th>
              <th className="px-4 py-3 text-center font-medium">
                Leads pendientes
              </th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="bg-card px-4 py-10 text-center text-muted-foreground"
                >
                  Sin resultados para esos filtros.
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const name =
                `${u.firstName} ${u.lastName}`.trim() || "(sin nombre)";
              const status = STATUS_CFG[u.status];
              const isManager = u.role === "manager";
              return (
                <tr
                  key={u.id}
                  className="border-t border-border bg-card hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <span
                        className={
                          isManager
                            ? "flex size-9 items-center justify-center rounded-full bg-accent/10 text-accent"
                            : "flex size-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-500"
                        }
                      >
                        {isManager ? (
                          <ShieldCheck className="size-4" />
                        ) : (
                          <Truck className="size-4" />
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isManager ? "Gerente de ventas" : "Proveedor de datos"}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {isManager ? u.vendors : <Dash />}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {isManager ? u.sales : <Dash />}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {u.activeLeads}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {u.pendingLeads}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                    >
                      Ver detalle <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground/40">—</span>;
}

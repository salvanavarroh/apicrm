"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ResendInviteDialog } from "@/components/users/resend-invite-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Card } from "@/components/ui/card";

import { resendInvitation } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  avatarUrl: string | null;
  vendors: number | null;
  sales: number | null;
  activeLeads: number;
  pendingLeads: number;
  branchIds: string[]; // sucursales asociadas (managements + branch_id directo)
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

export function UsersTable({
  rows,
  branches,
}: {
  rows: UsersTableRow[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const branchFromUrl = searchParams.get("branch") ?? "all";
  const [branchFilter, setBranchFilter] = useState<string>(branchFromUrl);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (branchFilter !== "all" && !r.branchIds.includes(branchFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = [r.firstName, r.lastName, r.email, r.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, roleFilter, branchFilter]);

  function changeBranch(v: string) {
    setBranchFilter(v);
    // Reflejar el filtro en la URL para que sea linkeable.
    const sp = new URLSearchParams(searchParams);
    if (v === "all") sp.delete("branch");
    else sp.set("branch", v);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header de filtros: grid en md+ para que NO se apilen verticalmente
          como pasaba con flex-wrap. Stack natural en mobile. */}
      <Card className="grid items-end gap-3 p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Buscar</Label>
          <Input
            placeholder="Nombre o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Rol</Label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 w-44">
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
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Sucursal</Label>
          <Select value={branchFilter} onValueChange={changeBranch}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="self-end pb-1.5 text-xs text-muted-foreground md:justify-self-end">
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
                      <UserAvatar
                        firstName={u.firstName}
                        lastName={u.lastName}
                        email={u.email}
                        avatarUrl={u.avatarUrl}
                        role={u.role}
                        size="md"
                      />
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.status === "pending" && (
                        <ResendInviteDialog
                          currentEmail={u.email}
                          action={(email) => resendInvitation(u.id, email)}
                        />
                      )}
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                      >
                        Ver detalle <ChevronRight className="ml-1 size-3.5" />
                      </Link>
                    </div>
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

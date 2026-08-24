"use client";

import { ChevronRight, PencilLine, Search, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EditCompanyAsSuperAdminDialog } from "./[id]/edit-company-dialog";

import { PlanBadge } from "@/components/companies/plan-select";
import type { CompanyPlan } from "@/lib/plans";

export type CompanyRow = {
  id: string;
  name: string;
  status: "active" | "pending" | "suspended";
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  plan: CompanyPlan | null;
  monthly_price: number | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  primaryAdmin: string;
  branches: number;
  admins: number;
  managers: number;
  sales: number;
};

type SortKey = "name" | "branches" | "managers" | "sales";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Nombre (A–Z)" },
  { value: "branches", label: "Más sucursales" },
  { value: "managers", label: "Más gerentes" },
  { value: "sales", label: "Más vendedores" },
];

export function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q))
      : rows.slice();
    base.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      // Orden descendente para los conteos (más grandes primero); desempate por nombre.
      const diff = b[sort] - a[sort];
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    return base;
  }, [rows, query, sort]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ordenar por</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay concesionarias que coincidan con la búsqueda.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">

          <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Concesionaria</th>
              <th className="px-4 py-3 font-medium">Administrador</th>
              <th className="px-4 py-3 text-center font-medium">Sucursales</th>
              <th className="px-4 py-3 text-center font-medium">Admins</th>
              <th className="px-4 py-3 text-center font-medium">Gerentes</th>
              <th className="px-4 py-3 text-center font-medium">Vendedores</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              // Toda la fila abre la concesionaria, no sólo la flecha del final.
              // El `stopPropagation` de la última celda evita que los botones de
              // acción (editar, ingresar como) disparen también la navegación.
              <tr
                key={c.id}
                onClick={() => router.push(`/super-admin/companies/${c.id}`)}
                className="cursor-pointer border-t border-border bg-card hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/super-admin/companies/${c.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Shield className="size-3.5 text-accent" />
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.primaryAdmin}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {c.branches}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {c.admins}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {c.managers}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {c.sales}
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={c.plan} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EditCompanyAsSuperAdminDialog
                      initial={{
                        id: c.id,
                        name: c.name,
                        legal_name: c.legal_name,
                        cuit: c.cuit,
                        phone: c.phone,
                        address: c.address,
                        logo_url: c.logo_url,
                        plan: c.plan,
                        monthly_price: c.monthly_price
                          ? Number(c.monthly_price)
                          : null,
                        subscription_starts_at: c.subscription_starts_at,
                        subscription_ends_at: c.subscription_ends_at,
                        status: c.status,
                      }}
                      trigger={
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Editar"
                          className="size-8"
                        >
                          <PencilLine className="size-3.5" />
                        </Button>
                      }
                    />
                    <Button
                      asChild
                      variant="outline"
                      size="icon"
                      aria-label="Detalle"
                      className="size-8"
                    >
                      <Link href={`/super-admin/companies/${c.id}`}>
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "pending" | "suspended";
}) {
  const cfg =
    status === "active"
      ? { label: "Activa", cls: "bg-success/10 text-success" }
      : status === "pending"
        ? {
            label: "Pendiente",
            cls: "bg-warning/10 text-warning-foreground",
          }
        : { label: "Suspendida", cls: "bg-destructive/10 text-destructive" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

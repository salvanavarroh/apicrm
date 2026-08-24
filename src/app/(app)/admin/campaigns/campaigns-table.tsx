"use client";

import { Megaphone, Search } from "lucide-react";
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

import { ORIGIN_LABELS, type Origin } from "./campaign-dialog";
import { CampaignRowActions } from "./campaign-row-actions";

export type CampaignRow = {
  id: string;
  name: string;
  origin: Origin;
  origin_other: string | null;
  product_type_id: string | null;
  branch_id: string | null;
  branch_ids: string[];
  status: "active" | "inactive";
  ptName: string | null;
  branchNames: string[];
};

// Etiqueta a mostrar: si es "Otros", el texto libre cargado.
function originLabel(c: { origin: Origin; origin_other: string | null }) {
  if (c.origin === "other") return c.origin_other?.trim() || "Otros";
  return ORIGIN_LABELS[c.origin];
}
// Clave de filtro: cada origen "Otros" distinto es su propio valor.
function originKey(c: { origin: Origin; origin_other: string | null }) {
  return c.origin === "other"
    ? `other:${c.origin_other?.trim() ?? ""}`
    : c.origin;
}

export function CampaignsTable({
  rows,
  branches,
  productTypes,
  customOrigins,
}: {
  rows: CampaignRow[];
  branches: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
  customOrigins: string[];
}) {
  const [query, setQuery] = useState("");
  const [originFilter, setOriginFilter] = useState("all");

  // Opciones de filtro de origen: las presentes en las campañas (predefinidas
  // + cada "Otros" puntual), deduplicadas y ordenadas por label.
  const originOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of rows) map.set(originKey(c), originLabel(c));
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (originFilter !== "all" && originKey(c) !== originFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, originFilter]);

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
          <span className="text-xs text-muted-foreground">Origen</span>
          <Select value={originFilter} onValueChange={setOriginFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los orígenes</SelectItem>
              {originOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay campañas que coincidan.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">

          <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Campaña</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Tipo de producto</th>
              <th className="px-4 py-3 font-medium">Sucursal</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border bg-card hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    <Megaphone className="size-3.5 text-accent" />
                    {c.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {originLabel(c)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.ptName ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.branchNames.length === 0
                    ? "Todas"
                    : c.branchNames.length <= 2
                      ? c.branchNames.join(", ")
                      : `${c.branchNames.slice(0, 2).join(", ")} +${c.branchNames.length - 2}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.status === "active"
                        ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {c.status === "active" ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <CampaignRowActions
                    campaign={{
                      id: c.id,
                      name: c.name,
                      origin: c.origin,
                      origin_other: c.origin_other,
                      product_type_id: c.product_type_id,
                      branch_id: c.branch_id,
                      branch_ids: c.branch_ids,
                      status: c.status,
                    }}
                    branches={branches}
                    productTypes={productTypes}
                    customOrigins={customOrigins}
                  />
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

"use client";

import { ChevronRight } from "lucide-react";
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
import {
  COMMERCIAL_LEAD_STATUSES,
  COMMERCIAL_LEAD_STATUS_CLS,
  COMMERCIAL_LEAD_STATUS_LABEL,
  type CommercialLeadStatus,
} from "@/lib/commercial-leads";
import { fullName } from "@/lib/leads";

export type CommercialLeadRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  company_name: string | null;
  phone: string | null;
  team_size: string | null;
  status: CommercialLeadStatus;
  created_at: string;
  utm_source: string | null;
  utm_campaign: string | null;
};

export function CommercialLeadsTable({
  rows,
}: {
  rows: CommercialLeadRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    CommercialLeadStatus | "all"
  >("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const name = fullName(r.first_name, r.last_name);
      return [
        name,
        r.email,
        r.company_name,
        r.phone,
        r.utm_source,
        r.utm_campaign,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-row flex-wrap items-center gap-3 p-4">
        <Input
          placeholder="Buscar por nombre, empresa, email, campaña…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as CommercialLeadStatus | "all")
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {COMMERCIAL_LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {COMMERCIAL_LEAD_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rows.length}
        </span>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="w-full overflow-x-auto">

          <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Equipo</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Recibido</th>
              <th className="px-4 py-3 text-right font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="bg-card px-4 py-10 text-center text-muted-foreground"
                >
                  Sin resultados para esos filtros.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const name = fullName(r.first_name, r.last_name);
              return (
                <tr
                  key={r.id}
                  className="border-t border-border bg-card hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/leads/${r.id}`}
                      className="flex flex-col hover:underline"
                    >
                      <span className="font-medium text-foreground">
                        {name || r.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.email}
                      </span>
                      {r.phone && (
                        <span className="text-[11px] text-muted-foreground">
                          {r.phone}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.company_name || (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.team_size || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.utm_source || r.utm_campaign ? (
                      <span className="flex flex-col">
                        {r.utm_source && (
                          <span className="font-medium text-foreground">
                            {r.utm_source}
                          </span>
                        )}
                        {r.utm_campaign && <span>{r.utm_campaign}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">Directo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${COMMERCIAL_LEAD_STATUS_CLS[r.status]}`}
                    >
                      {COMMERCIAL_LEAD_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/super-admin/leads/${r.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                    >
                      Abrir <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Card>
    </div>
  );
}

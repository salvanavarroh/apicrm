"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEAD_STATUS_LABELS,
  fullName,
  type LeadStatus,
} from "@/lib/leads";

import { LeadStatusBadge } from "./lead-status-badge";

export type LeadsTableRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  branch_name: string | null;
  product_type_name: string | null;
  campaign_name: string | null;
  assignee_name: string | null;
  created_at: string;
};

type Props = {
  rows: LeadsTableRow[];
  detailHrefPrefix: string;
  showAssignee?: boolean;
};

const STATUS_FILTER: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: LEAD_STATUS_LABELS.new },
  { value: "contacted", label: LEAD_STATUS_LABELS.contacted },
  { value: "interested", label: LEAD_STATUS_LABELS.interested },
  { value: "quoted", label: LEAD_STATUS_LABELS.quoted },
  { value: "not_interested", label: LEAD_STATUS_LABELS.not_interested },
];

export function LeadsTable({
  rows,
  detailHrefPrefix,
  showAssignee = true,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");

  function openDetail(rowId: string, e: React.MouseEvent) {
    // cmd/ctrl/middle-click → no interferir (deja que el browser abra tab nueva
    // si el target tiene href; igual aprovechamos prefetch del onMouseEnter).
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    router.push(`${detailHrefPrefix}/${rowId}`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const hay = [
        r.first_name,
        r.last_name,
        r.phone,
        r.email,
        r.branch_name,
        r.product_type_name,
        r.assignee_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, status]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre, tel, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as LeadStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {rows.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Campaña</TableHead>
              {showAssignee && <TableHead>Vendedor</TableHead>}
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showAssignee ? 7 : 6}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow
                key={row.id}
                role="link"
                tabIndex={0}
                onClick={(e) => openDetail(row.id, e)}
                onMouseEnter={() =>
                  router.prefetch(`${detailHrefPrefix}/${row.id}`)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`${detailHrefPrefix}/${row.id}`);
                  }
                }}
                className="cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <TableCell className="font-medium">
                  {fullName(row.first_name, row.last_name)}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="text-foreground">{row.phone ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.email ?? "—"}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {row.branch_name ?? <PoolBadge />}
                </TableCell>
                <TableCell className="text-sm">
                  {row.product_type_name ?? <PoolBadge />}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.campaign_name ?? "—"}
                </TableCell>
                {showAssignee && (
                  <TableCell className="text-sm">
                    {row.assignee_name ?? (
                      <span className="text-muted-foreground">
                        Sin asignar
                      </span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <LeadStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PoolBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      Sin clasificar
    </span>
  );
}

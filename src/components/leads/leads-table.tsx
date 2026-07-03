"use client";

import { AlertTriangle, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { reassignLeadsBulk } from "@/app/(app)/admin/leads/actions";
import { Button } from "@/components/ui/button";
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
  LEAD_TEMPERATURE_LABELS,
  fullName,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";

import { LeadStatusBadge } from "./lead-status-badge";
import type { AssignableUser } from "./reassign-dialog";
import { TemperatureBadge, TemperatureChanger } from "./temperature-control";

export type LeadsTableRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  temperature?: LeadTemperature | null;
  branch_name: string | null;
  product_type_name: string | null;
  campaign_name: string | null;
  assignee_name: string | null;
  created_at: string;
  last_contacted_at?: string | null;
  // Alerta de duplicado: el teléfono aparece en >1 lead de la empresa.
  is_duplicate?: boolean;
  // Opcionales: solo enriquecen el export (no se muestran como columna).
  vehicle_model?: string | null;
  vehicle_version?: string | null;
  city?: string | null;
};

type Props = {
  rows: LeadsTableRow[];
  detailHrefPrefix: string;
  showAssignee?: boolean;
  // El proveedor de datos no puede cambiar la temperatura: la mostramos como
  // badge de solo lectura.
  editableTemperature?: boolean;
  // Si se pasan, se habilita la selección múltiple + reasignación masiva
  // (Admin / Gerente).
  assignableUsers?: AssignableUser[];
  // Descarga de base: solo admin/superadmin, o gerente con permiso. Default off.
  canExport?: boolean;
  // Total real en la base (puede superar rows.length si se topó la carga).
  total?: number;
  capped?: boolean;
};

const PAGE_SIZE = 50;

const STATUS_FILTER: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: LEAD_STATUS_LABELS.new },
  { value: "contacted", label: LEAD_STATUS_LABELS.contacted },
  { value: "interested", label: LEAD_STATUS_LABELS.interested },
  { value: "quoted", label: LEAD_STATUS_LABELS.quoted },
  { value: "not_interested", label: LEAD_STATUS_LABELS.not_interested },
];

const TEMPERATURE_FILTER: { value: LeadTemperature | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "hot", label: `🔥 ${LEAD_TEMPERATURE_LABELS.hot}` },
  { value: "warm", label: `🟡 ${LEAD_TEMPERATURE_LABELS.warm}` },
  { value: "cold", label: `🔵 ${LEAD_TEMPERATURE_LABELS.cold}` },
];

function exportRows(rows: LeadsTableRow[]) {
  const data = rows.map((r) => ({
    Nombre: r.first_name ?? "",
    Apellido: r.last_name ?? "",
    Teléfono: r.phone ?? "",
    Email: r.email ?? "",
    Ciudad: r.city ?? "",
    Vehículo: [r.vehicle_model, r.vehicle_version].filter(Boolean).join(" "),
    Sucursal: r.branch_name ?? "",
    Tipo: r.product_type_name ?? "",
    Campaña: r.campaign_name ?? "",
    Vendedor: r.assignee_name ?? "",
    Estado: LEAD_STATUS_LABELS[r.status],
    Temperatura: r.temperature ? LEAD_TEMPERATURE_LABELS[r.temperature] : "",
    "Fecha alta": new Date(r.created_at).toLocaleDateString("es-AR"),
    "Últ. contacto": r.last_contacted_at
      ? new Date(r.last_contacted_at).toLocaleDateString("es-AR")
      : "",
  }));
  // BOM para que Excel respete acentos.
  const csv = "﻿" + Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

export function LeadsTable({
  rows,
  detailHrefPrefix,
  showAssignee = true,
  editableTemperature = true,
  assignableUsers,
  canExport = false,
  total,
  capped = false,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [temperature, setTemperature] = useState<LeadTemperature | "all">("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [contactFrom, setContactFrom] = useState("");
  const [contactTo, setContactTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();

  const selectable = Array.isArray(assignableUsers);

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
      if (temperature !== "all" && r.temperature !== temperature) return false;
      const createdDay = r.created_at.slice(0, 10);
      if (createdFrom && createdDay < createdFrom) return false;
      if (createdTo && createdDay > createdTo) return false;
      if (contactFrom || contactTo) {
        const contactDay = r.last_contacted_at?.slice(0, 10) ?? "";
        if (!contactDay) return false;
        if (contactFrom && contactDay < contactFrom) return false;
        if (contactTo && contactDay > contactTo) return false;
      }
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
  }, [
    rows,
    query,
    status,
    temperature,
    createdFrom,
    createdTo,
    contactFrom,
    contactTo,
  ]);

  // Volver a la página 1 cuando cambia el filtrado (ajuste de estado en render,
  // el patrón recomendado por React en vez de un useEffect con setState).
  const filterKey = [
    query,
    status,
    temperature,
    createdFrom,
    createdTo,
    contactFrom,
    contactTo,
  ].join("|");
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  }

  function runBulkReassign(assigneeId: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await reassignLeadsBulk(ids, assigneeId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(
        assigneeId
          ? `${res.updated} lead(s) reasignados`
          : `${res.updated} lead(s) desasignados`,
      );
      setSelected(new Set());
      setBulkAssignee("");
      router.refresh();
    });
  }

  const baseCols = showAssignee ? 9 : 8;
  const colSpan = baseCols + (selectable ? 1 : 0);

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
        <Select
          value={temperature}
          onValueChange={(v) => setTemperature(v as LeadTemperature | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPERATURE_FILTER.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportRows(filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="mr-2 size-4" /> Exportar
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {(total ?? rows.length).toLocaleString("es-AR")}
          {capped && total && total > rows.length && (
            <span className="ml-1 text-xs">
              (cargados {rows.length.toLocaleString("es-AR")})
            </span>
          )}
        </span>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-end gap-3 text-xs text-muted-foreground">
        <label className="flex flex-col gap-1">
          Creado desde
          <Input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          Creado hasta
          <Input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          Últ. contacto desde
          <Input
            type="date"
            value={contactFrom}
            onChange={(e) => setContactFrom(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          Últ. contacto hasta
          <Input
            type="date"
            value={contactTo}
            onChange={(e) => setContactTo(e.target.value)}
            className="h-8 w-40"
          />
        </label>
        {(createdFrom || createdTo || contactFrom || contactTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCreatedFrom("");
              setCreatedTo("");
              setContactFrom("");
              setContactTo("");
            }}
          >
            Limpiar fechas
          </Button>
        )}
      </div>

      {/* Barra de acciones masivas */}
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} seleccionado(s)
          </span>
          <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
            <SelectTrigger className="ml-2 h-8 w-56">
              <SelectValue placeholder="Reasignar a…" />
            </SelectTrigger>
            <SelectContent>
              {assignableUsers!.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {fullName(u.first_name, u.last_name)} ({u.activeLeads}/
                  {u.maxCapacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkAssignee || pending}
            onClick={() => runBulkReassign(bulkAssignee)}
          >
            Reasignar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => runBulkReassign(null)}
          >
            Desasignar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Limpiar
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="size-4 rounded border-input"
                  />
                </TableHead>
              )}
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Campaña</TableHead>
              {showAssignee && <TableHead>Vendedor</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead>Últ. contacto</TableHead>
              <TableHead>Temperatura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {paged.map((row) => (
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
                data-selected={selected.has(row.id) ? "" : undefined}
                className="cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none data-[selected]:bg-accent/10"
              >
                {selectable && (
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${fullName(row.first_name, row.last_name)}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="size-4 rounded border-input"
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {fullName(row.first_name, row.last_name)}
                    {row.is_duplicate && (
                      <span
                        title="Teléfono duplicado en la base"
                        className="inline-flex items-center"
                      >
                        <AlertTriangle className="size-4 text-amber-500" />
                      </span>
                    )}
                  </span>
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
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(row.last_contacted_at)}
                </TableCell>
                {/* Selector inline — stopPropagation para no navegar al detalle. */}
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {editableTemperature ? (
                    <TemperatureChanger
                      leadId={row.id}
                      current={row.temperature ?? null}
                      className="h-8 w-36"
                    />
                  ) : (
                    <TemperatureBadge temperature={row.temperature ?? null} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} de{" "}
            {filtered.length.toLocaleString("es-AR")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {safePage} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
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

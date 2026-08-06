"use client";

import { Download, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  reassignLeadsBulk,
  setLeadsArchived,
} from "@/app/(app)/admin/leads/actions";
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
import {
  exportLeadsTable,
  fetchLeadsTable,
  type LeadsTableFilters,
  type LeadsTableScope,
} from "@/lib/leads-table-actions";

import { LeadStatusBadge } from "./lead-status-badge";
import type { AssignableUser } from "./reassign-dialog";
import { TemperatureBadge, TemperatureChanger } from "./temperature-control";

// Debe coincidir con LEADS_TABLE_PAGE en leads-table-actions.ts.
const LEADS_TABLE_PAGE = 50;

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
  vehicle_model?: string | null;
  vehicle_version?: string | null;
  city?: string | null;
};

type Props = {
  scope: LeadsTableScope;
  detailHrefPrefix: string;
  // Primera página renderizada en el server (SSR). El cliente sólo vuelve a
  // pedir al server cuando el usuario busca / filtra / cambia de página, así
  // entrar y salir de un lead NO re-dispara una carga.
  initialRows: LeadsTableRow[];
  initialTotal: number;
  showAssignee?: boolean;
  editableTemperature?: boolean;
  // Si se pasan, se habilita la selección + reasignación/archivado masivos.
  assignableUsers?: AssignableUser[];
  canExport?: boolean;
  // Opciones para los filtros por columna (si se pasan, se muestra el filtro).
  branchOptions?: FilterOption[];
  productTypeOptions?: FilterOption[];
  vendorOptions?: FilterOption[];
  campaignOptions?: FilterOption[];
  // Filtro fijo por formulario de Lead Ads (llega vía ?form=). Se aplica siempre
  // y muestra un aviso con "Ver todos" para limpiarlo.
  formFilter?: { id: string; label: string };
};

export type FilterOption = { id: string; label: string };

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
    "Fecha alta": new Date(r.created_at).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    "Últ. contacto": r.last_contacted_at
      ? new Date(r.last_contacted_at).toLocaleDateString("es-AR")
      : "",
  }));
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
// Fecha + hora (dd/mm HH:mm) — para ver a qué hora entró el lead de un vistazo.
function fmtDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    time: d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function LeadsTable({
  scope,
  detailHrefPrefix,
  initialRows,
  initialTotal,
  showAssignee = true,
  editableTemperature = true,
  assignableUsers,
  canExport = false,
  branchOptions,
  productTypeOptions,
  vendorOptions,
  campaignOptions,
  formFilter,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<LeadsTableRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [temperature, setTemperature] = useState<LeadTemperature | "all">("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [contactFrom, setContactFrom] = useState("");
  const [contactTo, setContactTo] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [productTypeId, setProductTypeId] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [campaignId, setCampaignId] = useState("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const selectable = Array.isArray(assignableUsers);
  const archived = Boolean(scope.archived);

  // Debounce del buscador (350ms) para no pegar al server en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const filters: LeadsTableFilters = {
    q: debouncedQuery,
    status,
    temperature,
    createdFrom,
    createdTo,
    contactFrom,
    contactTo,
    branch_id: branchId === "all" ? undefined : branchId,
    product_type_id: productTypeId === "all" ? undefined : productTypeId,
    campaign_id: campaignId === "all" ? undefined : campaignId,
    assigned_user_id: vendorId === "all" ? undefined : vendorId,
    form_id: formFilter?.id,
  };

  // Reset a la página 1 cuando cambia cualquier filtro (ajuste en render).
  const filterKey = JSON.stringify(filters);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // En el primer render mostramos los datos que ya vinieron del server (SSR);
  // recién pedimos al server cuando el usuario interactúa.
  const firstRun = useRef(true);

  // Carga server-side de la página actual (sólo tras interacción).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetchLeadsTable(scope, filters, page);
        if (!cancelled) {
          setRows(res.rows);
          setTotal(res.total);
        }
      } catch {
        if (!cancelled) toast.error("No pude cargar los leads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // filters se captura vía sus primitivas; scope vía scope.archived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQuery,
    status,
    temperature,
    createdFrom,
    createdTo,
    contactFrom,
    contactTo,
    branchId,
    productTypeId,
    vendorId,
    campaignId,
    page,
    archived,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / LEADS_TABLE_PAGE));
  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  function openDetail(rowId: string, e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    router.push(`${detailHrefPrefix}/${rowId}`);
  }

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
      const ids = rows.map((r) => r.id);
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  function refresh() {
    // Fuerza recarga de la página actual re-pidiendo al server.
    startTransition(async () => {
      const res = await fetchLeadsTable(scope, filters, page);
      setRows(res.rows);
      setTotal(res.total);
    });
    router.refresh();
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
      refresh();
    });
  }

  function runBulkArchive() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await setLeadsArchived(ids, !archived);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(
        archived
          ? `${res.updated} lead(s) desarchivados`
          : `${res.updated} lead(s) archivados`,
      );
      setSelected(new Set());
      refresh();
    });
  }

  function runExport() {
    setExporting(true);
    exportLeadsTable(scope, filters)
      .then((all) => {
        if (all.length === 0) {
          toast.info("No hay leads para exportar");
          return;
        }
        exportRows(all);
      })
      .catch(() => toast.error("No pude exportar"))
      .finally(() => setExporting(false));
  }

  const baseCols = showAssignee ? 10 : 9;
  const colSpan = baseCols + (selectable ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {formFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Leads del formulario</span>
          <span className="font-medium">{formFilter.label}</span>
          <Link
            href={detailHrefPrefix}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" /> Ver todos
          </Link>
        </div>
      )}
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
        {branchOptions && branchOptions.length > 0 && (
          <ColumnFilter
            value={branchId}
            onChange={setBranchId}
            allLabel="Toda sucursal"
            options={branchOptions}
          />
        )}
        {productTypeOptions && productTypeOptions.length > 0 && (
          <ColumnFilter
            value={productTypeId}
            onChange={setProductTypeId}
            allLabel="Todo tipo"
            options={productTypeOptions}
          />
        )}
        {vendorOptions && vendorOptions.length > 0 && (
          <ColumnFilter
            value={vendorId}
            onChange={setVendorId}
            allLabel="Todo vendedor"
            options={[{ id: "unassigned", label: "Sin asignar" }, ...vendorOptions]}
          />
        )}
        {campaignOptions && campaignOptions.length > 0 && (
          <ColumnFilter
            value={campaignId}
            onChange={setCampaignId}
            allLabel="Toda campaña"
            options={campaignOptions}
          />
        )}
        {canExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={runExport}
            disabled={exporting || total === 0}
          >
            {exporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Exportar
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {loading && <Loader2 className="size-4 animate-spin" />}
          {total.toLocaleString("es-AR")} resultado(s)
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
            variant="outline"
            disabled={pending}
            onClick={runBulkArchive}
          >
            {archived ? "Desarchivar" : "Archivar"}
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
                    checked={allSelected}
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
              <TableHead>Ingresó</TableHead>
              <TableHead>Últ. contacto</TableHead>
              <TableHead>Temperatura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-10 text-center text-muted-foreground"
                >
                  {loading ? "Cargando…" : "Sin resultados"}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
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
                <TableCell className="text-sm text-muted-foreground">
                  {(() => {
                    const { date, time } = fmtDateTime(row.created_at);
                    return (
                      <div className="whitespace-nowrap">
                        <span className="text-foreground">{date}</span>
                        {time && <span className="ml-1.5 tabular-nums">{time}</span>}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(row.last_contacted_at)}
                </TableCell>
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

      {total > LEADS_TABLE_PAGE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Mostrando {(page - 1) * LEADS_TABLE_PAGE + 1}–
            {Math.min(page * LEADS_TABLE_PAGE, total)} de{" "}
            {total.toLocaleString("es-AR")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {page} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
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

function ColumnFilter({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import { Inbox, Loader2, SearchX, X } from "lucide-react";
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
import type { FilterOption } from "@/lib/lead-filter-options";
import {
  LEAD_STATUS_LABELS,
  LEAD_TEMPERATURE_LABELS,
  fullName,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";
import {
  exportLeadsTable,
  fetchLeadsSummary,
  fetchLeadsTable,
  type LeadsSummary,
  type LeadsTableFilters,
  type LeadsTableScope,
} from "@/lib/leads-table-actions";
import { cn } from "@/lib/utils";

import { LeadStatusBadge } from "./lead-status-badge";
import {
  EMPTY_FILTERS,
  LeadsFilterBar,
  hasAnyFilter,
  type LeadsFilterState,
} from "./leads-filter-bar";
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
  status_changed_at?: string | null;
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

const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

const DAY_MS = 86_400_000;

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

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

/** Fecha en lenguaje corto: "hoy", "ayer", "hace 5 d", "hace 3 sem". */
function fmtRelative(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d === null) return "—";
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 21) return `hace ${d} d`;
  if (d < 60) return `hace ${Math.round(d / 7)} sem`;
  return `hace ${Math.round(d / 30)} m`;
}

/** Fecha + hora (dd/mm/aa HH:mm) — para ver a qué hora entró el lead de un vistazo. */
function fmtDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }),
    time: d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Iniciales para el avatar de la fila (evita filas de puro texto plano). */
function initials(first: string | null, last: string | null): string {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
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
  const [summary, setSummary] = useState<LeadsSummary | null>(null);

  // Un solo objeto de estado para todos los filtros: la barra manda parches y
  // el efecto de carga observa una única clave serializada.
  const [f, setF] = useState<LeadsFilterState>(EMPTY_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const selectable = Array.isArray(assignableUsers);
  const archived = Boolean(scope.archived);

  // Debounce del buscador (350ms) para no pegar al server en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(f.q), 350);
    return () => clearTimeout(t);
  }, [f.q]);

  const filters: LeadsTableFilters = {
    q: debouncedQuery,
    status: f.status,
    temperature: f.temperature,
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
    contactFrom: f.contactFrom,
    contactTo: f.contactTo,
    branch_id: f.branchId === "all" ? undefined : f.branchId,
    product_type_id: f.productTypeId === "all" ? undefined : f.productTypeId,
    campaign_id: f.campaignId === "all" ? undefined : f.campaignId,
    assigned_user_id: f.vendorId === "all" ? undefined : f.vendorId,
    staleOnly: f.staleOnly || undefined,
    form_id: formFilter?.id,
  };
  const filterKey = JSON.stringify(filters);

  // Reset a la página 1 cuando cambia cualquier filtro (ajuste en render).
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // En el primer render mostramos los datos que ya vinieron del server (SSR);
  // recién pedimos filas al server cuando el usuario interactúa.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetchLeadsTable(scope, JSON.parse(filterKey), page);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, archived]);

  // Los contadores de los chips sí se piden en el montaje: son la parte del
  // encabezado que le da contexto al listado ("de 1.240, 87 sin gestión").
  useEffect(() => {
    let cancelled = false;
    fetchLeadsSummary(scope, JSON.parse(filterKey))
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        // Los contadores son informativos: si fallan, la tabla sigue andando.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, archived]);

  const pageCount = Math.max(1, Math.ceil(total / LEADS_TABLE_PAGE));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function patch(p: Partial<LeadsFilterState>) {
    setF((prev) => ({ ...prev, ...p }));
  }

  function clearAll() {
    setF(EMPTY_FILTERS);
    setDebouncedQuery("");
  }

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
      setSummary(await fetchLeadsSummary(scope, filters));
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

  // Cliente · Contacto · Vehículo · Sucursal/Tipo · Campaña · [Vendedor] ·
  // Estado · Ingresó · Últ. contacto · Temperatura
  const colSpan = 9 + (showAssignee ? 1 : 0) + (selectable ? 1 : 0);
  const filtered = hasAnyFilter(f);

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

      <LeadsFilterBar
        value={f}
        onChange={patch}
        onClear={clearAll}
        summary={summary}
        total={total}
        loading={loading}
        showAlerts={!archived}
        branchOptions={branchOptions}
        productTypeOptions={productTypeOptions}
        vendorOptions={vendorOptions}
        campaignOptions={campaignOptions}
        onExport={canExport ? runExport : undefined}
        exporting={exporting}
      />

      {/* Barra de acciones masivas */}
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <span className="text-sm font-semibold">
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

      <div className="relative overflow-hidden rounded-xl border">
        {/* Velo de carga: la tabla no "salta" al refiltrar. */}
        {loading && rows.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 bg-background/50" />
        )}
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
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
              <TableHead className="text-[11px] tracking-wide uppercase">
                Cliente
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Contacto
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Vehículo
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Sucursal / Tipo
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Campaña
              </TableHead>
              {showAssignee && (
                <TableHead className="text-[11px] tracking-wide uppercase">
                  Vendedor
                </TableHead>
              )}
              <TableHead className="text-[11px] tracking-wide uppercase">
                Estado
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Ingresó
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Últ. contacto
              </TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase">
                Temperatura
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="p-0">
                  <EmptyState
                    loading={loading}
                    filtered={filtered}
                    archived={archived}
                    onClear={clearAll}
                  />
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
                className="cursor-pointer hover:bg-accent/5 focus-visible:bg-accent/5 focus-visible:outline-none data-[selected]:bg-accent/10"
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

                {/* Cliente: semáforo de gestión + avatar + nombre + ciudad */}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <UrgencyDot
                      status={row.status}
                      statusChangedAt={row.status_changed_at}
                    />
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                      {initials(row.first_name, row.last_name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {fullName(row.first_name, row.last_name) || "Sin nombre"}
                      </span>
                      {row.city && (
                        <span className="truncate text-xs text-muted-foreground">
                          {row.city}
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="text-sm">
                  <div className="font-mono text-[13px] text-foreground">
                    {row.phone ?? "—"}
                  </div>
                  {row.email && (
                    <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {row.email}
                    </div>
                  )}
                </TableCell>

                <TableCell className="text-sm">
                  {row.vehicle_model || row.vehicle_version ? (
                    <>
                      <div className="font-medium">
                        {row.vehicle_model ?? "—"}
                      </div>
                      {row.vehicle_version && (
                        <div className="text-xs text-muted-foreground">
                          {row.vehicle_version}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </TableCell>

                <TableCell className="text-sm">
                  <div>{row.branch_name ?? <PoolBadge />}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.product_type_name ?? "sin tipo"}
                  </div>
                </TableCell>

                <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">
                  {row.campaign_name ?? "—"}
                </TableCell>

                {showAssignee && (
                  <TableCell className="text-sm">
                    {row.assignee_name ?? (
                      <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                        Sin asignar
                      </span>
                    )}
                  </TableCell>
                )}

                <TableCell>
                  <LeadStatusBadge status={row.status} />
                </TableCell>

                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {(() => {
                    const { date, time } = fmtDateTime(row.created_at);
                    return (
                      <>
                        <span className="text-foreground">{date}</span>
                        {time && (
                          <span className="ml-1.5 tabular-nums">{time}</span>
                        )}
                      </>
                    );
                  })()}
                </TableCell>

                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {fmtRelative(row.last_contacted_at)}
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

/**
 * Semáforo de gestión: verde <3 días, ámbar 3-7, rojo +7 desde el último cambio
 * de estado. Sólo para leads activos (un "no interesado" no está atrasado).
 * Misma regla que el semáforo del dashboard de Admin.
 */
function UrgencyDot({
  status,
  statusChangedAt,
}: {
  status: LeadStatus;
  statusChangedAt?: string | null;
}) {
  if (!ACTIVE_STATUSES.includes(status) || !statusChangedAt) {
    return <span aria-hidden className="size-1.5 shrink-0" />;
  }
  const d = daysSince(statusChangedAt) ?? 0;
  const tone = d >= 7 ? "danger" : d >= 3 ? "warning" : "ok";
  const label =
    tone === "danger"
      ? `Sin gestión hace ${d} días`
      : tone === "warning"
        ? `${d} días sin gestión`
        : "Al día";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "danger"
          ? "bg-destructive"
          : tone === "warning"
            ? "bg-warning"
            : "bg-success",
      )}
    />
  );
}

function EmptyState({
  loading,
  filtered,
  archived,
  onClear,
}: {
  loading: boolean;
  filtered: boolean;
  archived: boolean;
  onClear: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Buscando leads…</p>
      </div>
    );
  }

  const Icon = filtered ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">
          {filtered
            ? "Ningún lead coincide con estos filtros"
            : archived
              ? "No hay leads archivados"
              : "Todavía no hay leads"}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {filtered
            ? "Probá con menos filtros o un rango de fechas más amplio."
            : archived
              ? "Los leads que archives desde el listado aparecen acá."
              : "Cargá el primero a mano, importá un CSV o conectá un formulario para que entren solos."}
        </p>
      </div>
      {filtered && (
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
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

"use client";

import {
  ChevronDown,
  Download,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEAD_STATUS_LABELS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_META,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";
import type { FilterOption } from "@/lib/lead-filter-options";
import type { LeadsSummary } from "@/lib/leads-table-actions";
import { cn } from "@/lib/utils";

// ============================================================================
// Barra de filtros de la tabla de leads.
//
// Todo lo que filtra vive DENTRO del botón "Filtros": estados con contadores,
// alertas, columnas, fechas y los chips de lo que está aplicado. Afuera quedan
// sólo el buscador, la temperatura, el botón (con el número de filtros puestos)
// y el conteo de resultados.
//
// El motivo es mobile: los chips sueltos debajo de la barra ocupaban tres
// renglones y empujaban la lista fuera de la primera pantalla del teléfono. De
// paso, en desktop deja de haber dos lugares distintos donde filtrar.
// ============================================================================

export type LeadsFilterState = {
  q: string;
  status: LeadStatus | "all";
  temperature: LeadTemperature | "all";
  createdFrom: string;
  createdTo: string;
  contactFrom: string;
  contactTo: string;
  branchId: string;
  productTypeId: string;
  vendorId: string;
  campaignId: string;
  /** Sólo leads activos sin gestión hace +7 días. */
  staleOnly: boolean;
};

export const EMPTY_FILTERS: LeadsFilterState = {
  q: "",
  status: "all",
  temperature: "all",
  createdFrom: "",
  createdTo: "",
  contactFrom: "",
  contactTo: "",
  branchId: "all",
  productTypeId: "all",
  vendorId: "all",
  campaignId: "all",
  staleOnly: false,
};

// Estados que se muestran como chips, en orden de pipeline.
const CHIP_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
  "not_interested",
];

const TEMPERATURE_FILTER: { value: LeadTemperature | "all"; label: string }[] = [
  { value: "all", label: "Toda temperatura" },
  ...(["hot", "warm", "cold"] as LeadTemperature[]).map((t) => ({
    value: t,
    label: `${LEAD_TEMPERATURE_META[t].emoji} ${LEAD_TEMPERATURE_LABELS[t]}`,
  })),
];

/** Filtros por columna y por fecha (los del panel avanzado de siempre). */
function advancedCount(f: LeadsFilterState): number {
  return [
    f.branchId !== "all",
    f.productTypeId !== "all",
    f.vendorId !== "all",
    f.campaignId !== "all",
    Boolean(f.createdFrom),
    Boolean(f.createdTo),
    Boolean(f.contactFrom),
    Boolean(f.contactTo),
  ].filter(Boolean).length;
}

/** Todo lo que ahora vive dentro del botón "Filtros". El buscador y la
 *  temperatura quedan afuera, así que no cuentan para el badge. */
function panelCount(f: LeadsFilterState): number {
  return advancedCount(f) + (f.status !== "all" ? 1 : 0) + (f.staleOnly ? 1 : 0);
}

export function hasAnyFilter(f: LeadsFilterState): boolean {
  return panelCount(f) > 0 || Boolean(f.q) || f.temperature !== "all";
}

export function LeadsFilterBar({
  value,
  onChange,
  onClear,
  summary,
  total,
  loading,
  branchOptions,
  productTypeOptions,
  vendorOptions,
  campaignOptions,
  onExport,
  exporting,
  showAlerts = true,
}: {
  value: LeadsFilterState;
  onChange: (patch: Partial<LeadsFilterState>) => void;
  onClear: () => void;
  summary: LeadsSummary | null;
  total: number;
  loading: boolean;
  /** En la vista de archivados los recortes "sin asignar"/"sin gestión" no aplican. */
  showAlerts?: boolean;
  branchOptions?: FilterOption[];
  productTypeOptions?: FilterOption[];
  vendorOptions?: FilterOption[];
  campaignOptions?: FilterOption[];
  onExport?: () => void;
  exporting?: boolean;
}) {
  const applied = panelCount(value);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Al abrir el panel en un teléfono queda a mitad de camino: lo acercamos para
  // que no haya que scrollear a ciegas.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const labelFor = (opts: FilterOption[] | undefined, id: string) =>
    opts?.find((o) => o.id === id)?.label ?? id;

  const hasColumnFilters =
    Boolean(branchOptions?.length) ||
    Boolean(productTypeOptions?.length) ||
    Boolean(vendorOptions?.length) ||
    Boolean(campaignOptions?.length);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      {/* --- Fila principal ---------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-[220px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono, email, ciudad o modelo…"
            value={value.q}
            onChange={(e) => onChange({ q: e.target.value })}
            className="pl-8"
          />
          {value.q && (
            <button
              type="button"
              onClick={() => onChange({ q: "" })}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Select
          value={value.temperature}
          onValueChange={(v) =>
            onChange({ temperature: v as LeadTemperature | "all" })
          }
        >
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[190px]">
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

        <Button
          variant={open || applied > 0 ? "secondary" : "outline"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-[calc(50%-0.25rem)] justify-center sm:w-auto"
        >
          <SlidersHorizontal className="mr-2 size-4" />
          Filtros
          {applied > 0 && (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
              {applied}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-1.5 size-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>

        {onExport && (
          <Button
            variant="outline"
            onClick={onExport}
            disabled={exporting || total === 0}
            className="flex-1 justify-center sm:flex-none"
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
          <span className="font-medium text-foreground">
            {total.toLocaleString("es-AR")}
          </span>
          resultado{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* --- Panel de filtros -------------------------------------------- */}
      {open && (
        <div
          ref={panelRef}
          className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3"
        >
          {/* Estado: los chips con contadores, ahora acá adentro. */}
          <FilterGroup label="Estado">
            <StatusChip
              label="Todos"
              count={summary?.total}
              active={value.status === "all"}
              onClick={() => onChange({ status: "all" })}
            />
            {CHIP_STATUSES.map((s) => (
              <StatusChip
                key={s}
                label={LEAD_STATUS_LABELS[s]}
                count={summary?.byStatus[s]}
                active={value.status === s}
                onClick={() =>
                  onChange({ status: value.status === s ? "all" : s })
                }
              />
            ))}
          </FilterGroup>

          {showAlerts && (
            <FilterGroup label="Alertas">
              <StatusChip
                label="Sin asignar"
                count={summary?.unassigned}
                tone="warning"
                active={value.vendorId === "unassigned"}
                onClick={() =>
                  onChange({
                    vendorId:
                      value.vendorId === "unassigned" ? "all" : "unassigned",
                  })
                }
              />
              <StatusChip
                label="Sin gestión +7d"
                count={summary?.stale}
                tone="danger"
                active={value.staleOnly}
                onClick={() => onChange({ staleOnly: !value.staleOnly })}
              />
            </FilterGroup>
          )}

          {hasColumnFilters && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {branchOptions && branchOptions.length > 0 && (
                <ColumnFilter
                  label="Sucursal"
                  value={value.branchId}
                  onChange={(v) => onChange({ branchId: v })}
                  allLabel="Toda sucursal"
                  options={branchOptions}
                />
              )}
              {productTypeOptions && productTypeOptions.length > 0 && (
                <ColumnFilter
                  label="Tipo de producto"
                  value={value.productTypeId}
                  onChange={(v) => onChange({ productTypeId: v })}
                  allLabel="Todo tipo"
                  options={productTypeOptions}
                />
              )}
              {vendorOptions && vendorOptions.length > 0 && (
                <ColumnFilter
                  label="Vendedor"
                  value={value.vendorId}
                  onChange={(v) => onChange({ vendorId: v })}
                  allLabel="Todo vendedor"
                  options={[
                    { id: "unassigned", label: "Sin asignar" },
                    ...vendorOptions,
                  ]}
                />
              )}
              {campaignOptions && campaignOptions.length > 0 && (
                <ColumnFilter
                  label="Campaña"
                  value={value.campaignId}
                  onChange={(v) => onChange({ campaignId: v })}
                  allLabel="Toda campaña"
                  options={campaignOptions}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DateField
              label="Creado desde"
              value={value.createdFrom}
              max={value.createdTo || undefined}
              onChange={(v) => onChange({ createdFrom: v })}
            />
            <DateField
              label="Creado hasta"
              value={value.createdTo}
              min={value.createdFrom || undefined}
              onChange={(v) => onChange({ createdTo: v })}
            />
            <DateField
              label="Últ. contacto desde"
              value={value.contactFrom}
              max={value.contactTo || undefined}
              onChange={(v) => onChange({ contactFrom: v })}
            />
            <DateField
              label="Últ. contacto hasta"
              value={value.contactTo}
              min={value.contactFrom || undefined}
              onChange={(v) => onChange({ contactTo: v })}
            />
          </div>

          {/* Lo aplicado, removible de a uno — también acá adentro. */}
          {hasAnyFilter(value) && (
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Aplicados
              </span>
              {value.q && (
                <ActiveChip
                  label={`“${value.q}”`}
                  onRemove={() => onChange({ q: "" })}
                />
              )}
              {value.status !== "all" && (
                <ActiveChip
                  label={LEAD_STATUS_LABELS[value.status]}
                  onRemove={() => onChange({ status: "all" })}
                />
              )}
              {value.temperature !== "all" && (
                <ActiveChip
                  label={LEAD_TEMPERATURE_LABELS[value.temperature]}
                  onRemove={() => onChange({ temperature: "all" })}
                />
              )}
              {value.staleOnly && (
                <ActiveChip
                  label="Sin gestión +7d"
                  onRemove={() => onChange({ staleOnly: false })}
                />
              )}
              {value.branchId !== "all" && (
                <ActiveChip
                  label={labelFor(branchOptions, value.branchId)}
                  onRemove={() => onChange({ branchId: "all" })}
                />
              )}
              {value.productTypeId !== "all" && (
                <ActiveChip
                  label={labelFor(productTypeOptions, value.productTypeId)}
                  onRemove={() => onChange({ productTypeId: "all" })}
                />
              )}
              {value.vendorId !== "all" && (
                <ActiveChip
                  label={
                    value.vendorId === "unassigned"
                      ? "Sin asignar"
                      : labelFor(vendorOptions, value.vendorId)
                  }
                  onRemove={() => onChange({ vendorId: "all" })}
                />
              )}
              {value.campaignId !== "all" && (
                <ActiveChip
                  label={labelFor(campaignOptions, value.campaignId)}
                  onRemove={() => onChange({ campaignId: "all" })}
                />
              )}
              {(value.createdFrom || value.createdTo) && (
                <ActiveChip
                  label={`Alta ${value.createdFrom || "…"} → ${value.createdTo || "…"}`}
                  onRemove={() => onChange({ createdFrom: "", createdTo: "" })}
                />
              )}
              {(value.contactFrom || value.contactTo) && (
                <ActiveChip
                  label={`Contacto ${value.contactFrom || "…"} → ${value.contactTo || "…"}`}
                  onRemove={() => onChange({ contactFrom: "", contactTo: "" })}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onClear}
              >
                Limpiar todo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function StatusChip({
  label,
  count,
  active,
  tone = "default",
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  tone?: "default" | "warning" | "danger";
  onClick: () => void;
}) {
  // Los chips de alerta con 0 no aportan: se apagan en vez de gritar.
  const muted = tone !== "default" && count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // `min-h-8`: en un teléfono un chip de 26px de alto se falla al tocar.
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : tone === "danger" && !muted
            ? "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/60"
            : tone === "warning" && !muted
              ? "border-warning/40 bg-warning/10 text-warning-text hover:border-warning"
              : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            active ? "opacity-90" : "opacity-70",
          )}
        >
          {count.toLocaleString("es-AR")}
        </span>
      )}
    </button>
  );
}

function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-accent/10 py-0.5 pr-1 pl-2 text-xs text-accent">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        className="rounded-full p-0.5 hover:bg-accent/20"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function ColumnFilter({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: FilterOption[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
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
    </label>
  );
}

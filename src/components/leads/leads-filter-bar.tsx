"use client";

import { Download, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

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
// Antes eran ~10 controles sueltos en una fila que envolvía, más 4 inputs de
// fecha siempre visibles: mucho ruido y ninguna jerarquía. Ahora:
//   1. Fila principal: búsqueda + temperatura + botón "Filtros" + export.
//   2. Chips de estado con contadores (clickeables, hacen de filtro).
//   3. Panel avanzado colapsado (columnas + fechas) con contador de activos.
//   4. Chips de filtros activos, removibles de a uno.
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

/** Cuenta filtros activos que viven en el panel avanzado. */
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

export function hasAnyFilter(f: LeadsFilterState): boolean {
  return (
    advancedCount(f) > 0 ||
    Boolean(f.q) ||
    f.status !== "all" ||
    f.temperature !== "all" ||
    f.staleOnly
  );
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
  const advanced = advancedCount(value);
  const [open, setOpen] = useState(advanced > 0);
  const hasAdvancedPanel =
    Boolean(branchOptions?.length) ||
    Boolean(productTypeOptions?.length) ||
    Boolean(vendorOptions?.length) ||
    Boolean(campaignOptions?.length);

  const labelFor = (opts: FilterOption[] | undefined, id: string) =>
    opts?.find((o) => o.id === id)?.label ?? id;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      {/* --- Fila principal ---------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
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
          <SelectTrigger className="w-[190px]">
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

        {hasAdvancedPanel && (
          <Button
            variant={open ? "secondary" : "outline"}
            onClick={() => setOpen((o) => !o)}
          >
            <SlidersHorizontal className="mr-2 size-4" />
            Filtros
            {advanced > 0 && (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                {advanced}
              </span>
            )}
          </Button>
        )}

        {onExport && (
          <Button
            variant="outline"
            onClick={onExport}
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
      </div>

      {/* --- Chips de estado con contadores ------------------------------ */}
      <div className="flex flex-wrap items-center gap-1.5">
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

        {showAlerts && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />

            {/* Alertas: los dos recortes que el gerente pide primero. */}
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
          </>
        )}

        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {loading && <Loader2 className="size-4 animate-spin" />}
          <span className="font-medium text-foreground">
            {total.toLocaleString("es-AR")}
          </span>
          resultado{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* --- Panel avanzado --------------------------------------------- */}
      {open && hasAdvancedPanel && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-2">
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

          <div className="flex flex-wrap items-end gap-3">
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
            <span className="mx-1 mb-2 h-8 w-px bg-border" aria-hidden />
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
        </div>
      )}

      {/* --- Chips de filtros activos ----------------------------------- */}
      {hasAnyFilter(value) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Filtros
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : tone === "danger" && !muted
            ? "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/60"
            : tone === "warning" && !muted
              ? "border-warning/40 bg-warning/5 text-warning-foreground hover:border-warning"
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-44">
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

function DateField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-40"
      />
    </label>
  );
}

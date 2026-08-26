"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { formatARS } from "@/lib/format";

import {
  CompanyStatusToggle,
  MarkAsPaidButton,
} from "./billing-row-actions";

export type BillingRow = {
  id: string;
  companyId: string;
  companyName: string;
  companyStatus: "active" | "pending" | "suspended";
  adminName: string;
  adminEmail: string;
  phone: string | null;
  amount: number;
  users: number;
  periodKey: string;   // YYYY-MM
  periodLabel: string; // "Junio 2026"
  paymentStatus: "pending" | "paid" | "overdue";
  dueDate: string;     // YYYY-MM-DD
  paidAt: string | null;
};

type PaymentStatusFilter = "all" | "pending" | "paid" | "overdue";

// ============================================================================
// Root: 2 tabs (Mes actual / Histórico)
// ============================================================================

export function BillingTable({ rows }: { rows: BillingRow[] }) {
  const todayKey = currentMonthKey();
  const currentRows = rows.filter((r) => r.periodKey === todayKey);
  const pendingCount = currentRows.filter(
    (r) => r.paymentStatus !== "paid",
  ).length;

  return (
    <Tabs defaultValue="current" className="gap-4">
      <TabsList>
        <TabsTrigger value="current">
          Mes actual
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
              {pendingCount} por cobrar
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="current">
        <CurrentMonthView rows={currentRows} />
      </TabsContent>

      <TabsContent value="history">
        <HistoryView rows={rows} />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// Tab 1: Mes actual — foco en "qué concesionarias faltan pagar".
// ============================================================================

function CurrentMonthView({ rows }: { rows: BillingRow[] }) {
  const [query, setQuery] = useState("");
  // Default "all" — el tab muestra TODO el mes (pagados + no pagados) para
  // tener la foto completa de a quién facturás este período.
  const [statusFilter, setStatusFilter] =
    useState<PaymentStatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all") {
        if (statusFilter === "pending") {
          // En este tab "pending" agrupa pending + overdue (todo lo NO cobrado).
          if (r.paymentStatus === "paid") return false;
        } else if (r.paymentStatus !== statusFilter) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [r.companyName, r.adminName, r.adminEmail, r.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  const kpis = computeKpis(filtered);

  return (
    <div className="flex flex-col gap-4">
      <BillingKpis kpis={kpis} />

      <Card className="grid grid-cols-1 items-center gap-3 p-4 md:grid-cols-[1fr_auto]">
        <SearchInput value={query} onChange={setQuery} />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PaymentStatusFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Por cobrar</SelectItem>
            <SelectItem value="paid">Cobradas</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <BillingRowsTable
        rows={filtered}
        emptyMessage={
          statusFilter === "pending"
            ? "Todas las concesionarias ya pagaron este mes 🎉"
            : statusFilter === "paid"
              ? "Todavía no hay pagos cobrados este mes."
              : "No hay registros para este mes."
        }
        hidePeriodColumn
      />
    </div>
  );
}

// ============================================================================
// Tab 2: Histórico — buscador + rango de fechas + status + paginación.
// ============================================================================

function HistoryView({ rows }: { rows: BillingRow[] }) {
  // Default: últimos 6 meses (basados en due_date).
  const defaultDates = useMemo(() => {
    if (rows.length === 0) return { from: "", to: "" };
    const sortedDueDates = rows
      .map((r) => r.dueDate)
      .filter(Boolean)
      .sort();
    const minDate = sortedDueDates[0] ?? "";
    const maxDate = sortedDueDates[sortedDueDates.length - 1] ?? "";
    return { from: minDate.slice(0, 10), to: maxDate.slice(0, 10) };
  }, [rows]);

  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [statusFilter, setStatusFilter] =
    useState<PaymentStatusFilter>("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = [r.companyName, r.adminName, r.adminEmail, r.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const due = r.dueDate.slice(0, 10);
      if (dateFrom && due < dateFrom) return false;
      if (dateTo && due > dateTo) return false;
      if (statusFilter !== "all" && r.paymentStatus !== statusFilter)
        return false;
      return true;
    });
  }, [rows, query, dateFrom, dateTo, statusFilter]);

  const kpis = computeKpis(filtered);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const visible = filtered.slice(startIdx, endIdx);

  function reset() {
    setQuery("");
    setDateFrom(defaultDates.from);
    setDateTo(defaultDates.to);
    setStatusFilter("all");
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <BillingKpis kpis={kpis} />

      <Card className="grid grid-cols-1 items-end gap-3 p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Buscar</Label>
          <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Desde</Label>
          <DatePicker
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(1); }}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Hasta</Label>
          <DatePicker
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(1); }}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px]">Estado</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as PaymentStatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="paid">Pagados</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="overdue">Vencidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={reset}
          className="h-9 self-end rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
        >
          Limpiar
        </button>
      </Card>

      <BillingRowsTable
        rows={visible}
        emptyMessage="No hay pagos para esos filtros."
      />

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "0 resultados"
              : `${startIdx + 1}-${endIdx} de ${filtered.length}`}
          </span>
          <span className="hidden h-4 w-px bg-border sm:inline-block" />
          <div className="flex items-center gap-2">
            <span>Filas por página:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Subcomponentes compartidos
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Concesionaria, administrador, email…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full pl-9"
      />
    </div>
  );
}

type Kpis = {
  billed: number;
  collected: number;
  pendingAmt: number;
  overdueAmt: number;
  count: number;
};

function computeKpis(rows: BillingRow[]): Kpis {
  let billed = 0;
  let collected = 0;
  let pendingAmt = 0;
  let overdueAmt = 0;
  for (const r of rows) {
    billed += r.amount;
    if (r.paymentStatus === "paid") collected += r.amount;
    else if (r.paymentStatus === "overdue") overdueAmt += r.amount;
    else pendingAmt += r.amount;
  }
  return { billed, collected, pendingAmt, overdueAmt, count: rows.length };
}

function BillingKpis({ kpis }: { kpis: Kpis }) {
  const pct =
    kpis.billed === 0 ? 0 : Math.round((kpis.collected / kpis.billed) * 100);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        label="Facturado"
        value={kpis.billed}
        hint={`${kpis.count} pago${kpis.count === 1 ? "" : "s"}`}
        tone="muted"
      />
      <KpiTile
        label="Cobrado"
        value={kpis.collected}
        hint={`${pct}% del total`}
        tone="success"
      />
      <KpiTile
        label="Pendiente"
        value={kpis.pendingAmt}
        hint="Sin vencer"
        tone="warning"
      />
      <KpiTile
        label="Vencido"
        value={kpis.overdueAmt}
        hint="Requiere acción"
        tone="destructive"
      />
    </div>
  );
}

const KPI_TONE_CLS = {
  muted: "border-border bg-card",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  destructive: "border-destructive/30 bg-destructive/5",
} as const;

const KPI_LABEL_CLS = {
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
} as const;

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof KPI_TONE_CLS;
}) {
  return (
    <Card className={`flex flex-col gap-1 p-4 ${KPI_TONE_CLS[tone]}`}>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wider ${KPI_LABEL_CLS[tone]}`}
      >
        {label}
      </span>
      <span className="text-2xl font-bold tracking-tight text-foreground">
        {formatARS(value)}
      </span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </Card>
  );
}

function BillingRowsTable({
  rows,
  emptyMessage,
  hidePeriodColumn,
}: {
  rows: BillingRow[];
  emptyMessage: string;
  hidePeriodColumn?: boolean;
}) {
  const colSpan = hidePeriodColumn ? 8 : 9;
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Concesionaria</th>
              <th className="px-4 py-3 font-medium">Administrador</th>
              {!hidePeriodColumn && (
                <th className="px-4 py-3 font-medium">Período</th>
              )}
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 text-center font-medium">Usuarios</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Activación</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="bg-card px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border bg-card hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-success/10 text-success">
                      <Building2 className="size-4" />
                    </span>
                    <span className="font-medium">{r.companyName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-foreground">{r.adminName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.adminEmail}
                  </div>
                </td>
                {!hidePeriodColumn && (
                  <td className="px-4 py-3 text-sm text-foreground">
                    {r.periodLabel}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  {formatARS(r.amount)}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {r.users}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatShortDate(r.dueDate)}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={r.paymentStatus} />
                </td>
                <td className="px-4 py-3">
                  <CompanyStatusToggle
                    companyId={r.companyId}
                    status={r.companyStatus}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  {r.paymentStatus !== "paid" ? (
                    <MarkAsPaidButton paymentId={r.id} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Pagado {r.paidAt?.slice(0, 10)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: "pending" | "paid" | "overdue";
}) {
  return (
    <span
      className={
        status === "paid"
          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
          : status === "overdue"
            ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
            : "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground"
      }
    >
      {status === "paid"
        ? "Pagado"
        : status === "overdue"
          ? "Vencido"
          : "Pendiente"}
    </span>
  );
}

// ============================================================================
// Paginación
// ============================================================================

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <div className="flex items-center gap-1">
        <PageButton disabled>
          <ChevronLeft className="size-3.5" />
        </PageButton>
        <PageButton active>1</PageButton>
        <PageButton disabled>
          <ChevronRight className="size-3.5" />
        </PageButton>
      </div>
    );
  }

  const pages = pageNumbers(page, totalPages);

  return (
    <div className="flex items-center gap-1">
      <PageButton
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="size-3.5" />
      </PageButton>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`dots-${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <PageButton
            key={p}
            active={p === page}
            onClick={() => onChange(p)}
          >
            {p}
          </PageButton>
        ),
      )}
      <PageButton
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Página siguiente"
      >
        <ChevronRight className="size-3.5" />
      </PageButton>
    </div>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
} & React.AriaAttributes) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors " +
        (active
          ? "border-accent bg-accent text-accent-foreground"
          : disabled
            ? "border-border bg-card text-muted-foreground/40"
            : "border-border bg-card text-foreground hover:bg-muted/60")
      }
      {...props}
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// ============================================================================
// Date / period helpers
// ============================================================================

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon}. ${yr}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

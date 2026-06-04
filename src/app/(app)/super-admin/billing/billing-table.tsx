"use client";

import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
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
  /** Mes del que es ESTE pago (no la fecha de habilitación). YYYY-MM. */
  periodKey: string;
  periodLabel: string; // "Junio 2026"
  paymentStatus: "pending" | "paid" | "overdue";
  dueDate: string;
  paidAt: string | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function BillingTable({ rows }: { rows: BillingRow[] }) {
  const todayKey = currentMonthKey();
  const [query, setQuery] = useState("");
  // Default: si hay datos del mes actual, mostrarlo. Sino, "all".
  const [periodFilter, setPeriodFilter] = useState<string>(() => {
    return rows.some((r) => r.periodKey === todayKey) ? todayKey : "all";
  });
  const [statusFilter, setStatusFilter] = useState<
    "all" | "paid" | "pending" | "overdue"
  >("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  // Genera lista de meses disponibles desde la data (más reciente primero).
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.periodKey);
    return Array.from(set).sort().reverse();
  }, [rows]);

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
      if (periodFilter !== "all" && r.periodKey !== periodFilter) return false;
      if (statusFilter !== "all" && r.paymentStatus !== statusFilter)
        return false;
      return true;
    });
  }, [rows, query, periodFilter, statusFilter]);

  // KPIs sobre el set filtrado (no sobre rows, así reflejan el período).
  const kpis = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pendingAmt = 0;
    let overdueAmt = 0;
    for (const r of filtered) {
      billed += r.amount;
      if (r.paymentStatus === "paid") collected += r.amount;
      else if (r.paymentStatus === "overdue") overdueAmt += r.amount;
      else pendingAmt += r.amount;
    }
    return { billed, collected, pendingAmt, overdueAmt };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const visible = filtered.slice(startIdx, endIdx);

  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs del período seleccionado */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Facturado"
          value={kpis.billed}
          hint={`${filtered.length} pago${filtered.length === 1 ? "" : "s"}`}
          tone="muted"
        />
        <KpiTile
          label="Cobrado"
          value={kpis.collected}
          hint={`${Math.round(
            (kpis.billed === 0 ? 0 : (kpis.collected / kpis.billed) * 100),
          )}% del total`}
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

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar concesionaria, administrador, email…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <Select
            value={periodFilter}
            onValueChange={(v) => {
              setPeriodFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los períodos</SelectItem>
              {availablePeriods.map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as "all" | "paid" | "pending" | "overdue");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="paid">Pagados</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="overdue">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Concesionaria</th>
              <th className="px-4 py-3 font-medium">Administrador</th>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 text-center font-medium">Usuarios</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Estado del pago</th>
              <th className="px-4 py-3 font-medium">Activar / Desactivar</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="bg-card px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No hay resultados para esos filtros.
                </td>
              </tr>
            )}
            {visible.map((r) => (
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
                <td className="px-4 py-3 text-sm text-foreground">
                  {r.periodLabel}
                </td>
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
                  <span
                    className={
                      r.paymentStatus === "paid"
                        ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                        : r.paymentStatus === "overdue"
                          ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                          : "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground"
                    }
                  >
                    {r.paymentStatus === "paid"
                      ? "Pagado"
                      : r.paymentStatus === "overdue"
                        ? "Vencido"
                        : "Pendiente"}
                  </span>
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
      </Card>

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
              onValueChange={(v) => changePageSize(Number(v))}
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

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon}. ${yr}`;
}

function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  if (!y || !m) return periodKey;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

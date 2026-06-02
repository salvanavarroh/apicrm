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
  subscriptionStartsAt: string | null;
  paymentStatus: "pending" | "paid" | "overdue";
  dueDate: string;
  paidAt: string | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon}. ${yr}`;
}

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "Todos los períodos" },
  { value: "current", label: "Mes actual" },
  { value: "previous", label: "Mes anterior" },
  { value: "quarter", label: "Último trimestre" },
  { value: "year", label: "Este año" },
];

export function BillingTable({ rows }: { rows: BillingRow[] }) {
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const yr = now.getUTCFullYear();
    const mo = now.getUTCMonth() + 1;
    return rows.filter((r) => {
      if (q) {
        const hay = [
          r.companyName,
          r.adminName,
          r.adminEmail,
          r.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateRange === "current") {
        const d = new Date(r.dueDate);
        return d.getUTCFullYear() === yr && d.getUTCMonth() + 1 === mo;
      }
      if (dateRange === "previous") {
        const d = new Date(r.dueDate);
        const target = mo === 1 ? { y: yr - 1, m: 12 } : { y: yr, m: mo - 1 };
        return (
          d.getUTCFullYear() === target.y && d.getUTCMonth() + 1 === target.m
        );
      }
      if (dateRange === "quarter") {
        const d = new Date(r.dueDate);
        const diffMonths =
          (yr - d.getUTCFullYear()) * 12 + (mo - (d.getUTCMonth() + 1));
        return diffMonths >= 0 && diffMonths < 3;
      }
      if (dateRange === "year") {
        const d = new Date(r.dueDate);
        return d.getUTCFullYear() === yr;
      }
      return true;
    });
  }, [rows, query, dateRange]);

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
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[260px] flex-1">
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
            value={dateRange}
            onValueChange={(v) => {
              setDateRange(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Concesionaria</th>
              <th className="px-4 py-3 font-medium">Administrador</th>
              <th className="px-4 py-3 font-medium">Nro de teléfono</th>
              <th className="px-4 py-3 text-right font-medium">Monto mensual</th>
              <th className="px-4 py-3 text-center font-medium">Usuarios</th>
              <th className="px-4 py-3 font-medium">Fecha de habilitación</th>
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
                <td className="px-4 py-3 text-muted-foreground">
                  {r.phone ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  {formatARS(r.amount)}
                </td>
                <td className="px-4 py-3 text-center text-foreground">
                  {r.users}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatShortDate(r.subscriptionStartsAt)}
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

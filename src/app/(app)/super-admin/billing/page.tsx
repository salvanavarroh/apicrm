import { Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import {
  CompanyStatusToggle,
  MarkAsPaidButton,
} from "./billing-row-actions";

type PaymentWithCompany = {
  id: string;
  status: "pending" | "paid" | "overdue";
  amount: number;
  due_date: string;
  period_year: number;
  period_month: number;
  paid_at: string | null;
  company: {
    id: string;
    name: string;
    phone: string | null;
    status: "active" | "pending" | "suspended";
    subscription_ends_at: string | null;
    profiles: { first_name: string; last_name: string; role: string }[];
  };
};

function isOverdue(p: { status: string; due_date: string }) {
  return p.status === "pending" && new Date(p.due_date) < new Date();
}

function periodLabel(p: { period_year: number; period_month: number }) {
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
  return `${months[p.period_month - 1]} ${String(p.period_year).slice(2)}`;
}

export default async function BillingPage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_payments")
    .select(
      "id, status, amount, due_date, period_year, period_month, paid_at, company:companies!subscription_payments_company_id_fkey(id, name, phone, status, subscription_ends_at, profiles!profiles_company_id_fkey(first_name, last_name, role))",
    )
    .order("due_date", { ascending: false });

  const payments = (data ?? []) as unknown as PaymentWithCompany[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Controlá el estado de pagos, facturación y activación de cada
          concesionaria.
        </p>
      </header>

      {payments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Receipt className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no se generaron pagos. El cron mensual los crea
            automáticamente.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Concesionaria</th>
                <th className="px-4 py-3 font-medium">Administrador</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Vencimiento</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const admin = p.company.profiles.find(
                  (pr) => pr.role === "admin",
                );
                const adminName = admin
                  ? `${admin.first_name} ${admin.last_name}`.trim()
                  : "—";
                const overdue = isOverdue({
                  status: p.status,
                  due_date: p.due_date,
                });

                return (
                  <tr key={p.id} className="border-t border-border bg-card hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{p.company.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {adminName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.company.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {periodLabel(p)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      ${p.amount}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.due_date}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          p.status === "paid"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : overdue
                              ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                              : "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground"
                        }
                      >
                        {p.status === "paid"
                          ? "Pagado"
                          : overdue
                            ? "Vencido"
                            : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CompanyStatusToggle
                        companyId={p.company.id}
                        status={p.company.status}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "pending" || overdue ? (
                        <MarkAsPaidButton paymentId={p.id} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {p.paid_at?.slice(0, 10)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

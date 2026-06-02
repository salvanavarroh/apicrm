import { Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { BillingTable, type BillingRow } from "./billing-table";

type PaymentRow = {
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
    subscription_starts_at: string | null;
    subscription_ends_at: string | null;
    profiles: { id: string; first_name: string; last_name: string; role: string; status: string }[];
  };
};

export default async function BillingPage() {
  await requireRole(["super_admin"]);

  const admin = createAdminClient();

  // Pagos + datos de empresa + usuarios para contar activos.
  const { data: payments } = await admin
    .from("subscription_payments")
    .select(
      `id, status, amount, due_date, period_year, period_month, paid_at,
       company:companies!subscription_payments_company_id_fkey(
         id, name, phone, status, subscription_starts_at, subscription_ends_at,
         profiles!profiles_company_id_fkey(id, first_name, last_name, role, status)
       )`,
    )
    .order("due_date", { ascending: false });

  // Emails de los admins.
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailByUserId = new Map<string, string>();
  for (const u of usersList?.users ?? []) {
    if (u.email) emailByUserId.set(u.id, u.email);
  }

  const rows: BillingRow[] = ((payments ?? []) as unknown as PaymentRow[]).map(
    (p) => {
      const admins = p.company.profiles.filter((pr) => pr.role === "admin");
      const adminProfile = admins[0];
      const activeUsers = p.company.profiles.filter(
        (pr) => pr.status === "active",
      ).length;
      const overdue =
        p.status === "pending" && new Date(p.due_date) < new Date();
      return {
        id: p.id,
        companyId: p.company.id,
        companyName: p.company.name,
        companyStatus: p.company.status,
        adminName: adminProfile
          ? `${adminProfile.first_name} ${adminProfile.last_name}`.trim()
          : "—",
        adminEmail: adminProfile
          ? (emailByUserId.get(adminProfile.id) ?? "—")
          : "—",
        phone: p.company.phone,
        amount: Number(p.amount),
        users: activeUsers,
        subscriptionStartsAt:
          p.company.subscription_starts_at ?? p.company.subscription_ends_at,
        paymentStatus: overdue ? "overdue" : p.status,
        dueDate: p.due_date,
        paidAt: p.paid_at,
      };
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Controlá el estado de pagos, facturación y activación de cada
          concesionaria.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Receipt className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no se generaron pagos. El cron mensual los crea
            automáticamente.
          </p>
        </Card>
      ) : (
        <BillingTable rows={rows} />
      )}
    </div>
  );
}

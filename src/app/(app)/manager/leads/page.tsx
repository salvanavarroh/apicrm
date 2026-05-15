import { Plus } from "lucide-react";
import Link from "next/link";

import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerLeadsPage() {
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  // RLS filtra automáticamente por las gerencias del manager.
  const { data } = await supabase
    .from("leads")
    .select(
      `
        id,
        first_name,
        last_name,
        phone,
        email,
        status,
        created_at,
        branches:branch_id (name),
        product_types:product_type_id (name),
        campaigns:campaign_id (name),
        assignee:profiles!assigned_user_id (first_name, last_name)
      `,
    )
    .eq("company_id", profile.company_id!)
    .order("created_at", { ascending: false });

  const rows: LeadsTableRow[] = (data ?? []).map((l) => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
    campaign_name: l.campaigns?.name ?? null,
    assignee_name: l.assignee
      ? fullName(l.assignee.first_name, l.assignee.last_name)
      : null,
    created_at: l.created_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Leads de tus gerencias (sucursal + tipo de producto que manejás).
          </p>
        </div>
        <Button asChild>
          <Link href="/manager/leads/new">
            <Plus className="mr-2 size-4" /> Nuevo lead
          </Link>
        </Button>
      </header>

      <LeadsTable rows={rows} detailHrefPrefix="/manager/leads" />
    </div>
  );
}

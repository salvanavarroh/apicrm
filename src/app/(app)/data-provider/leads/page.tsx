import { FileUp, Plus } from "lucide-react";
import Link from "next/link";

import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DataProviderLeadsPage() {
  const profile = await requireRole(["data_provider"]);
  const supabase = await createClient();

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
        campaigns:campaign_id (name)
      `,
    )
    .eq("created_by", profile.id)
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
    assignee_name: null,
    created_at: l.created_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis cargas</h1>
          <p className="text-sm text-muted-foreground">
            Todos los leads que cargaste. Podés editar los que están en estado
            Nuevo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/data-provider/leads/import">
              <FileUp className="mr-2 size-4" /> Importar CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/data-provider/leads/new">
              <Plus className="mr-2 size-4" /> Nuevo lead
            </Link>
          </Button>
        </div>
      </header>

      <LeadsTable
        rows={rows}
        detailHrefPrefix="/data-provider/leads"
        showAssignee={false}
      />
    </div>
  );
}

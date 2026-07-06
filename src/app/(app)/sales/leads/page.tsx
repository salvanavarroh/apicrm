import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { fetchKanbanColumn } from "@/lib/kanban-actions";
import { fetchPaged } from "@/lib/leads-fetch";
import {
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

const TABLE_SELECT = `
  id,
  first_name,
  last_name,
  phone,
  email,
  city,
  vehicle_model,
  vehicle_version,
  status,
  temperature,
  created_at,
  branches:branch_id (name),
  product_types:product_type_id (name),
  campaigns:campaign_id (name)
`;

const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

type Search = { tab?: string };

export default async function SalesLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();
  const { tab } = await searchParams;
  const activeTab = tab === "table" ? "table" : "kanban";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mis leads</h1>
        <p className="text-sm text-muted-foreground">
          Movelos entre columnas arrastrando, o abrí el detalle para gestionar
          la conversación.
        </p>
      </header>

      <Tabs value={activeTab}>
        <TabsList>
          <TabsTrigger value="kanban" asChild>
            <Link href="/sales/leads?tab=kanban">
              <LayoutGrid className="mr-2 size-4" /> Kanban
            </Link>
          </TabsTrigger>
          <TabsTrigger value="table" asChild>
            <Link href="/sales/leads?tab=table">
              <List className="mr-2 size-4" /> Tabla
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "kanban" ? (
        <SalesKanban supabase={supabase} />
      ) : (
        <SalesTable supabase={supabase} userId={profile.id} />
      )}
    </div>
  );
}

async function SalesKanban({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [countsRes, ...cols] = await Promise.all([
    supabase.rpc("lead_status_counts"),
    ...STATUSES.map((s) => fetchKanbanColumn(s, 0)),
  ]);
  const counts: Partial<Record<LeadStatus, number>> = {};
  for (const row of countsRes.data ?? []) counts[row.status] = Number(row.cnt);
  const kanbanItems: KanbanLead[] = cols.flat();

  return (
    <KanbanBoard
      leads={kanbanItems}
      counts={counts}
      detailHrefPrefix="/sales/leads"
    />
  );
}

async function SalesTable({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const leadsPage = await fetchPaged((withCount) =>
    supabase
      .from("leads")
      .select(TABLE_SELECT, withCount ? { count: "exact" } : {})
      .eq("assigned_user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  );

  const tableRows: LeadsTableRow[] = leadsPage.rows.map((l) => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    temperature: l.temperature,
    city: l.city,
    vehicle_model: l.vehicle_model,
    vehicle_version: l.vehicle_version,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
    campaign_name: l.campaigns?.name ?? null,
    assignee_name: null,
    created_at: l.created_at,
  }));

  return (
    <LeadsTable
      rows={tableRows}
      detailHrefPrefix="/sales/leads"
      showAssignee={false}
      total={leadsPage.total}
      capped={leadsPage.capped}
    />
  );
}

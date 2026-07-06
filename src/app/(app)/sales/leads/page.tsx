import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import { LeadsTable } from "@/components/leads/leads-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { fetchKanbanColumn } from "@/lib/kanban-actions";
import { fetchLeadsTable } from "@/lib/leads-table-actions";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

type Search = { tab?: string };

export default async function SalesLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireRole(["sales"]);
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
        <SalesTable />
      )}
    </div>
  );
}

async function SalesTable() {
  const initial = await fetchLeadsTable({}, {}, 1);
  return (
    <LeadsTable
      scope={{}}
      detailHrefPrefix="/sales/leads"
      initialRows={initial.rows}
      initialTotal={initial.total}
      showAssignee={false}
    />
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


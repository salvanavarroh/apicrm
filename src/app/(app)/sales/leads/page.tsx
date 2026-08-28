import { Inbox, LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import {
  LeadsPageHeader,
  LeadsPageHeaderSkeleton,
} from "@/components/leads/leads-page-header";
import { LeadsSectionSkeleton } from "@/components/leads/leads-skeletons";
import { LeadsTable } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { fetchKanbanColumn } from "@/lib/kanban-actions";
import { loadLeadFilterOptions } from "@/lib/lead-filter-options";
import { fetchLeadsSummary, fetchLeadsTable } from "@/lib/leads-table-actions";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

type Search = { tab?: string; stale?: string };

export default async function SalesLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();
  const { tab, stale } = await searchParams;
  // `?stale=1` llega del contador "Sin gestión +7d" del encabezado: abre la
  // tabla ya filtrada. Antes el número te decía que tenías 3 atrasados y no
  // había ningún lugar donde verlos.
  const staleOnly = stale === "1";
  const activeTab = staleOnly || tab === "table" ? "table" : "kanban";

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<LeadsPageHeaderSkeleton stats={3} />}>
        <SalesLeadsHeader firstName={profile.first_name} />
      </Suspense>

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

      <Suspense
        key={activeTab}
        fallback={<LeadsSectionSkeleton view={activeTab} />}
      >
        {activeTab === "kanban" ? (
          <SalesKanban supabase={supabase} />
        ) : (
          <SalesTable companyId={profile.company_id!} staleOnly={staleOnly} />
        )}
      </Suspense>
    </div>
  );
}

// El vendedor no necesita "sin asignar" (todo lo suyo está asignado): lo que le
// mueve la aguja es qué tiene atrasado y qué no calificó todavía.
async function SalesLeadsHeader({ firstName }: { firstName: string | null }) {
  const summary = await fetchLeadsSummary({}, {});
  return (
    <LeadsPageHeader
      icon={Inbox}
      title="Mis leads"
      description={`${
        firstName ? `${firstName}, ` : ""
      }movelos entre columnas arrastrando o abrí el detalle para gestionar la conversación.`}
      stats={[
        {
          label: "Activos",
          value: summary.active,
          hint: `${summary.total.toLocaleString("es-AR")} asignados en total`,
        },
        {
          label: "Sin gestión +7d",
          value: summary.stale,
          tone: summary.stale > 0 ? "danger" : "success",
          href: summary.stale > 0 ? "/sales/leads?stale=1" : undefined,
          hint: summary.stale > 0 ? "Contactalos hoy" : "Todo al día",
        },
        {
          label: "Sin temperatura",
          value: summary.noTemperature,
          tone: summary.noTemperature > 0 ? "warning" : "default",
          hint: "Calificalos para priorizar",
        },
      ]}
      actions={
        <Button asChild>
          <Link href="/sales/leads/new">
            <Plus className="mr-2 size-4" /> Nuevo lead
          </Link>
        </Button>
      }
    />
  );
}

async function SalesTable({
  companyId,
  staleOnly,
}: {
  companyId: string;
  staleOnly?: boolean;
}) {
  const supabase = await createClient();
  // El SSR tiene que traer la primera página CON el filtro: el cliente sólo
  // vuelve a pedir cuando el usuario interactúa.
  const [initial, options] = await Promise.all([
    fetchLeadsTable({}, staleOnly ? { staleOnly: true } : {}, 1),
    loadLeadFilterOptions(supabase, companyId),
  ]);
  return (
    <LeadsTable
      scope={{}}
      detailHrefPrefix="/sales/leads"
      initialRows={initial.rows}
      initialTotal={initial.total}
      initialFilters={staleOnly ? { staleOnly: true } : undefined}
      showAssignee={false}
      branchOptions={options.branches}
      productTypeOptions={options.productTypes}
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


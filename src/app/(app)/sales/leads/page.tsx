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

type Search = { tab?: string; stale?: string; active?: string; temp?: string };

export default async function SalesLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();
  const { tab, stale, active, temp } = await searchParams;
  // Los contadores del encabezado abren la tabla ya filtrada. Un número que te
  // dice que tenés 29 atrasados y no te lleva a ellos es una pregunta sin
  // respuesta: antes sólo "Sin gestión" llevaba a algún lado.
  const staleOnly = stale === "1";
  const activeOnly = active === "1";
  const noTemperature = temp === "none";
  const filtered = staleOnly || activeOnly || noTemperature;
  const activeTab = filtered || tab === "table" ? "table" : "kanban";

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
          <SalesTable
            companyId={profile.company_id!}
            staleOnly={staleOnly}
            activeOnly={activeOnly}
            noTemperature={noTemperature}
          />
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
          href: summary.active > 0 ? "/sales/leads?active=1" : undefined,
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
          href:
            summary.noTemperature > 0 ? "/sales/leads?temp=none" : undefined,
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
  activeOnly,
  noTemperature,
}: {
  companyId: string;
  staleOnly?: boolean;
  activeOnly?: boolean;
  noTemperature?: boolean;
}) {
  const supabase = await createClient();
  const preset = {
    ...(staleOnly ? { staleOnly: true } : {}),
    ...(activeOnly ? { activeOnly: true } : {}),
    ...(noTemperature ? { temperature: "none" as const } : {}),
  };
  const hasPreset = Object.keys(preset).length > 0;
  // El SSR tiene que traer la primera página CON el filtro: el cliente sólo
  // vuelve a pedir cuando el usuario interactúa.
  const [initial, options] = await Promise.all([
    fetchLeadsTable({}, preset, 1),
    loadLeadFilterOptions(supabase, companyId),
  ]);
  return (
    <LeadsTable
      scope={{}}
      detailHrefPrefix="/sales/leads"
      initialRows={initial.rows}
      initialTotal={initial.total}
      initialFilters={hasPreset ? preset : undefined}
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


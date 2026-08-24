import {
  Archive,
  Inbox,
  LayoutGrid,
  List,
  Plus,
  Upload,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  LeadsPageHeader,
  LeadsPageHeaderSkeleton,
} from "@/components/leads/leads-page-header";
import { LeadsSectionSkeleton } from "@/components/leads/leads-skeletons";
import { LeadsTable } from "@/components/leads/leads-table";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actingManagerId, requireRole } from "@/lib/auth";
import { fetchKanbanColumn } from "@/lib/kanban-actions";
import { loadLeadFilterOptions } from "@/lib/lead-filter-options";
import { fetchLeadsSummary, fetchLeadsTable } from "@/lib/leads-table-actions";
import { LEAD_STATUS_LABELS, fullName, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

type Search = { tab?: string };

export default async function ManagerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();
  const cid = profile.company_id!;
  const { tab } = await searchParams;
  const activeTab =
    tab === "table" || tab === "unassigned" || tab === "archived"
      ? tab
      : "kanban";

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<LeadsHeaderFallback />}>
        <ManagerLeadsHeader />
      </Suspense>

      <Tabs value={activeTab}>
        <TabsList>
          <TabsTrigger value="kanban" asChild>
            <Link href="/manager/leads?tab=kanban">
              <LayoutGrid className="mr-2 size-4" /> Kanban
            </Link>
          </TabsTrigger>
          <TabsTrigger value="table" asChild>
            <Link href="/manager/leads?tab=table">
              <List className="mr-2 size-4" /> Tabla
            </Link>
          </TabsTrigger>
          <TabsTrigger value="unassigned" asChild>
            <Link href="/manager/leads?tab=unassigned">
              <UserPlus className="mr-2 size-4" /> No asignados
              <Suspense fallback={null}>
                <UnassignedBadge cid={cid} />
              </Suspense>
            </Link>
          </TabsTrigger>
          <TabsTrigger value="archived" asChild>
            <Link href="/manager/leads?tab=archived">
              <Archive className="mr-2 size-4" /> Archivados
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Suspense
        key={activeTab}
        fallback={<LeadsSectionSkeleton view={activeTab} />}
      >
        {activeTab === "kanban" && (
          <ManagerKanban supabase={supabase} cid={cid} />
        )}
        {activeTab === "table" && (
          <ManagerTable
            cid={cid}
            canExport={profile.can_export_leads}
            managerId={actingManagerId(profile)}
          />
        )}
        {activeTab === "archived" && (
          <ManagerTable
            cid={cid}
            canExport={profile.can_export_leads}
            managerId={actingManagerId(profile)}
            archived
          />
        )}
        {activeTab === "unassigned" && (
          <ManagerUnassigned
            supabase={supabase}
            cid={cid}
            managerId={actingManagerId(profile)}
          />
        )}
      </Suspense>
    </div>
  );
}

// Header con banner + contadores. Va en su propio Suspense: los conteos son
// exactos (count en la DB) y no tienen por qué frenar el resto de la pantalla.
async function ManagerLeadsHeader() {
  const summary = await fetchLeadsSummary({ archived: false }, {});
  return (
    <LeadsPageHeader
      icon={Inbox}
      title="Leads"
      description="Pipeline completo de tus gerencias (sucursal + tipo de producto que manejás)."
      stats={[
        {
          label: "Activos",
          value: summary.active,
          hint: `${summary.total.toLocaleString("es-AR")} en total`,
        },
        {
          label: "Sin asignar",
          value: summary.unassigned,
          tone: summary.unassigned > 0 ? "warning" : "default",
          href: "/manager/leads?tab=unassigned",
          hint: "Asignar ahora",
        },
        {
          label: "Sin gestión +7d",
          value: summary.stale,
          tone: summary.stale > 0 ? "danger" : "success",
          hint: summary.stale > 0 ? "Requieren contacto" : "Todo al día",
        },
        {
          label: "Sin temperatura",
          value: summary.noTemperature,
          hint: "Activos sin calificar",
        },
      ]}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/manager/leads/import">
              <Upload className="mr-2 size-4" /> Importar CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/manager/leads/new">
              <Plus className="mr-2 size-4" /> Nuevo lead
            </Link>
          </Button>
        </>
      }
    />
  );
}

function LeadsHeaderFallback() {
  return <LeadsPageHeaderSkeleton />;
}

// Badge de "No asignados" — cuenta exacta, en su propio Suspense para no frenar
// la barra de pestañas.
async function UnassignedBadge({ cid }: { cid: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("company_id", cid)
    .is("assigned_user_id", null)
    .is("archived_at", null)
    .not("branch_id", "is", null)
    .not("product_type_id", "is", null);
  if (!count) return null;
  return (
    <span className="ml-2 rounded-full bg-warning/20 px-2 text-[10px] font-semibold text-warning-foreground">
      {count > 999 ? "999+" : count}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Kanban: top-50 por estado + conteos reales. No carga miles.
// ----------------------------------------------------------------------------
async function ManagerKanban({
  supabase,
  cid,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  cid: string;
}) {
  void cid;
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
      detailHrefPrefix="/manager/leads"
    />
  );
}

// ----------------------------------------------------------------------------
// Tabla: se pagina del lado del cliente; se trae en tandas hasta el cap.
// ----------------------------------------------------------------------------
async function ManagerTable({
  cid,
  canExport,
  managerId,
  archived = false,
}: {
  cid: string;
  canExport: boolean;
  managerId: string;
  archived?: boolean;
}) {
  const supabase = await createClient();
  const [team, initial, options] = await Promise.all([
    getAssignableSalesUsers({ companyId: cid, managerId }),
    fetchLeadsTable({ archived }, {}, 1),
    loadLeadFilterOptions(supabase, cid, managerId),
  ]);
  return (
    <LeadsTable
      scope={{ archived }}
      detailHrefPrefix="/manager/leads"
      initialRows={initial.rows}
      initialTotal={initial.total}
      assignableUsers={team}
      canExport={canExport}
      branchOptions={options.branches}
      productTypeOptions={options.productTypes}
      vendorOptions={options.vendors}
      campaignOptions={options.campaigns}
    />
  );
}

// ----------------------------------------------------------------------------
// No asignados: lista propia (límite 500) + count exacto.
// ----------------------------------------------------------------------------
async function ManagerUnassigned({
  supabase,
  cid,
  managerId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  cid: string;
  managerId: string;
}) {
  const LIMIT = 500;
  const [{ data: unassigned, count }, team] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
          id,
          first_name,
          last_name,
          vehicle_model,
          status,
          product_type_id,
          branches:branch_id (name),
          product_types:product_type_id (name)
        `,
        { count: "exact" },
      )
      .eq("company_id", cid)
      .is("assigned_user_id", null)
      .is("archived_at", null)
      .not("branch_id", "is", null)
      .not("product_type_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    getAssignableSalesUsers({ companyId: cid, managerId }),
  ]);

  const list = unassigned ?? [];
  const total = count ?? list.length;
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No hay leads pendientes de asignación.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {total > list.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {list.length} de {total} sin asignar. Usá la asignación
          automática o reasigná por tandas.
        </p>
      )}
      <div className="overflow-hidden rounded-md border">
        <div className="w-full overflow-x-auto">

          <table className="w-full text-sm">
          <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Cliente</th>
              <th className="px-4 py-2 text-left">Vehículo</th>
              <th className="px-4 py-2 text-left">Sucursal</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((lead) => (
              <tr
                key={lead.id}
                className="border-b bg-card last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-medium">
                  {fullName(lead.first_name, lead.last_name)}
                </td>
                <td className="px-4 py-3 text-xs">
                  {lead.vehicle_model ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {lead.branches?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {lead.product_types?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <LeadStatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ReassignDialog
                    leadId={lead.id}
                    leadProductTypeId={lead.product_type_id}
                    currentAssigneeId={null}
                    users={team}
                    trigger={
                      <Button size="sm" variant="outline">
                        Asignar
                      </Button>
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

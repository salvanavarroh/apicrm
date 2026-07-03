import { LayoutGrid, List, Plus, Upload, UserPlus } from "lucide-react";
import Link from "next/link";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { actingManagerId, requireRole } from "@/lib/auth";
import { fetchPaged } from "@/lib/leads-fetch";
import { fullName, normalizePhone } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

const LEADS_SELECT = `
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
  status_changed_at,
  created_at,
  last_contacted_at,
  branch_id,
  product_type_id,
  assigned_user_id,
  branches:branch_id (name),
  product_types:product_type_id (name),
  campaigns:campaign_id (name),
  assignee:profiles!assigned_user_id (first_name, last_name)
`;

export default async function ManagerLeadsPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  // RLS filtra automáticamente a sus gerencias.
  // La lista principal se trae en tandas (PostgREST topa en 1000 filas/request)
  // hasta el cap; tabla y kanban paginan del lado del cliente. Los "No
  // asignados" van en su propio query con count EXACTO.
  const UNASSIGNED_LIST_LIMIT = 500;
  const [leadsPage, team, unassignedRes] = await Promise.all([
    fetchPaged((withCount) =>
      supabase
        .from("leads")
        .select(LEADS_SELECT, withCount ? { count: "exact" } : {})
        .eq("company_id", profile.company_id!)
        .order("created_at", { ascending: false }),
    ),
    getAssignableSalesUsers({
      companyId: profile.company_id!,
      managerId: actingManagerId(profile),
    }),
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
      .eq("company_id", profile.company_id!)
      .is("assigned_user_id", null)
      .not("branch_id", "is", null)
      .not("product_type_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(UNASSIGNED_LIST_LIMIT),
  ]);

  const leads = leadsPage.rows;
  const leadsTotal = leadsPage.total;
  const leadsCapped = leadsPage.capped;
  const unassigned = unassignedRes.data ?? [];
  const unassignedCount = unassignedRes.count ?? unassigned.length;

  const kanbanItems: KanbanLead[] = leads.map((l) => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    vehicle_model: l.vehicle_model,
    vehicle_version: l.vehicle_version,
    status: l.status,
    temperature: l.temperature,
    status_changed_at: l.status_changed_at,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
    assignee_name: l.assignee
      ? fullName(l.assignee.first_name, l.assignee.last_name)
      : null,
  }));

  const phoneCounts = new Map<string, number>();
  for (const l of leads) {
    const p = normalizePhone(l.phone);
    if (p) phoneCounts.set(p, (phoneCounts.get(p) ?? 0) + 1);
  }

  const tableRows: LeadsTableRow[] = leads.map((l) => {
    const p = normalizePhone(l.phone);
    return {
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
      assignee_name: l.assignee
        ? fullName(l.assignee.first_name, l.assignee.last_name)
        : null,
      created_at: l.created_at,
      last_contacted_at: l.last_contacted_at,
      is_duplicate: p ? (phoneCounts.get(p) ?? 0) > 1 : false,
    };
  });


  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline completo de tus gerencias (sucursal + tipo de producto que
            manejás).
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </header>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">
            <LayoutGrid className="mr-2 size-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="table">
            <List className="mr-2 size-4" /> Tabla
          </TabsTrigger>
          <TabsTrigger value="unassigned">
            <UserPlus className="mr-2 size-4" /> No asignados
            {unassignedCount > 0 && (
              <span className="ml-2 rounded-full bg-warning/20 px-2 text-[10px] font-semibold text-warning-foreground">
                {unassignedCount > 999 ? "999+" : unassignedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard
            leads={kanbanItems}
            detailHrefPrefix="/manager/leads"
            total={leadsTotal}
            capped={leadsCapped}
          />
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <LeadsTable
            rows={tableRows}
            detailHrefPrefix="/manager/leads"
            assignableUsers={team}
            canExport={profile.can_export_leads}
            total={leadsTotal}
            capped={leadsCapped}
          />
        </TabsContent>

        <TabsContent value="unassigned" className="mt-4">
          {unassigned.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No hay leads pendientes de asignación.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {unassignedCount > unassigned.length && (
                <p className="text-xs text-muted-foreground">
                  Mostrando {unassigned.length} de {unassignedCount} sin asignar.
                  Usá la asignación automática o reasigná por tandas.
                </p>
              )}
              <div className="overflow-hidden rounded-md border">
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
                  {unassigned.map((lead) => (
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

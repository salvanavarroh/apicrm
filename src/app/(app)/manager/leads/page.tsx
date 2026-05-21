import { LayoutGrid, List, Plus, UserPlus } from "lucide-react";
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
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function ManagerLeadsPage() {
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  // RLS filtra automáticamente a sus gerencias.
  const [{ data }, team] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
          id,
          first_name,
          last_name,
          phone,
          email,
          vehicle_model,
          status,
          created_at,
          branch_id,
          product_type_id,
          assigned_user_id,
          branches:branch_id (name),
          product_types:product_type_id (name),
          campaigns:campaign_id (name),
          assignee:profiles!assigned_user_id (first_name, last_name)
        `,
      )
      .eq("company_id", profile.company_id!)
      .order("created_at", { ascending: false }),
    getAssignableSalesUsers({
      companyId: profile.company_id!,
      managerId: profile.id,
    }),
  ]);

  const leads = data ?? [];

  const kanbanItems: KanbanLead[] = leads.map((l) => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    vehicle_model: l.vehicle_model,
    status: l.status,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
  }));

  const tableRows: LeadsTableRow[] = leads.map((l) => ({
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

  const unassigned = leads.filter(
    (l) =>
      !l.assigned_user_id &&
      l.branch_id !== null &&
      l.product_type_id !== null,
  );

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
        <Button asChild>
          <Link href="/manager/leads/new">
            <Plus className="mr-2 size-4" /> Nuevo lead
          </Link>
        </Button>
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
            {unassigned.length > 0 && (
              <span className="ml-2 rounded-full bg-warning/20 px-2 text-[10px] font-semibold text-warning-foreground">
                {unassigned.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard
            leads={kanbanItems}
            detailHrefPrefix="/manager/leads"
          />
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <LeadsTable rows={tableRows} detailHrefPrefix="/manager/leads" />
        </TabsContent>

        <TabsContent value="unassigned" className="mt-4">
          {unassigned.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No hay leads pendientes de asignación.
            </div>
          ) : (
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
                      className="border-b bg-background last:border-0 hover:bg-muted/40"
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

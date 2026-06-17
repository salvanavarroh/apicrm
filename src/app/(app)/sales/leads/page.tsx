import { LayoutGrid, List } from "lucide-react";

import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/leads/kanban-board";
import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SalesLeadsPage() {
  const profile = await requireRole(["sales"]);
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
        city,
        vehicle_model,
        vehicle_version,
        status,
        temperature,
        status_changed_at,
        created_at,
        branches:branch_id (name),
        product_types:product_type_id (name),
        campaigns:campaign_id (name)
      `,
    )
    .eq("assigned_user_id", profile.id)
    .order("created_at", { ascending: false });

  const myName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || null;
  const kanbanItems: KanbanLead[] = (data ?? []).map((l) => ({
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
    assignee_name: myName,
  }));

  const tableRows: LeadsTableRow[] = (data ?? []).map((l) => ({
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
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mis leads</h1>
        <p className="text-sm text-muted-foreground">
          Movelos entre columnas arrastrando, o abrí el detalle para gestionar
          la conversación.
        </p>
      </header>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">
            <LayoutGrid className="mr-2 size-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="table">
            <List className="mr-2 size-4" /> Tabla
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard
            leads={kanbanItems}
            detailHrefPrefix="/sales/leads"
          />
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <LeadsTable
            rows={tableRows}
            detailHrefPrefix="/sales/leads"
            showAssignee={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

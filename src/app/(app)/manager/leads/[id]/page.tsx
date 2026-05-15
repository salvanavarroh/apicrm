import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  NotesSection,
  type LeadNote,
} from "@/components/leads/notes-section";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import {
  TasksSection,
  type LeadTask,
} from "@/components/leads/tasks-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import {
  LEAD_PAYMENT_LABELS,
  fullName,
  type LeadPaymentMethod,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function ManagerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  const [{ data: lead }, { data: notes }, { data: tasks }, team] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          `
            *,
            branches:branch_id (name),
            product_types:product_type_id (name),
            campaigns:campaign_id (name),
            assignee:profiles!assigned_user_id (first_name, last_name)
          `,
        )
        .eq("id", id)
        .eq("company_id", profile.company_id!)
        .maybeSingle(),
      supabase
        .from("lead_notes")
        .select(
          `
            id,
            content,
            created_at,
            author:profiles!author_id (first_name, last_name)
          `,
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_tasks")
        .select("id, title, description, priority, due_date, completed_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      getAssignableSalesUsers({
        companyId: profile.company_id!,
        managerId: profile.id,
      }),
    ]);

  if (!lead) notFound();

  const noteRows: LeadNote[] = (notes ?? []).map((n) => ({
    id: n.id,
    content: n.content,
    created_at: n.created_at,
    author: n.author ?? null,
  }));
  const taskRows: LeadTask[] = (tasks ?? []) as LeadTask[];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/manager/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {fullName(lead.first_name, lead.last_name)}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <LeadStatusBadge status={lead.status} />
            <span>·</span>
            <span>
              {new Date(lead.created_at).toLocaleDateString("es-AR")}
            </span>
          </div>
        </div>
        <ReassignDialog
          leadId={lead.id}
          leadProductTypeId={lead.product_type_id}
          currentAssigneeId={lead.assigned_user_id}
          users={team}
          trigger={<Button variant="outline">Reasignar</Button>}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Teléfono" value={lead.phone} />
              <Detail label="Email" value={lead.email} />
              <Detail label="Ciudad" value={lead.city} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vehículo</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Modelo" value={lead.vehicle_model} />
              <Detail label="Versión" value={lead.vehicle_version} />
              <Detail label="Color" value={lead.preferred_color} />
              <Detail
                label="Presupuesto"
                value={
                  lead.budget_min || lead.budget_max
                    ? `$${lead.budget_min ?? "—"} - $${lead.budget_max ?? "—"}`
                    : "—"
                }
              />
              <Detail
                label="Forma de pago"
                value={
                  lead.declared_payment_method
                    ? LEAD_PAYMENT_LABELS[
                        lead.declared_payment_method as LeadPaymentMethod
                      ]
                    : "—"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Routing</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Sucursal" value={lead.branches?.name} />
              <Detail label="Tipo producto" value={lead.product_types?.name} />
              <Detail label="Campaña" value={lead.campaigns?.name} />
              <Detail
                label="Vendedor"
                value={
                  lead.assignee
                    ? fullName(
                        lead.assignee.first_name,
                        lead.assignee.last_name,
                      )
                    : "Sin asignar"
                }
              />
            </CardContent>
          </Card>

          <TasksSection leadId={lead.id} tasks={taskRows} />
        </div>

        <div className="flex flex-col gap-4">
          <NotesSection leadId={lead.id} notes={noteRows} />
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium text-foreground">{value || "—"}</div>
    </div>
  );
}

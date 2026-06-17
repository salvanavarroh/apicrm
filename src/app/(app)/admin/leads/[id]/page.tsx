import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  NotesSection,
  type LeadNote,
} from "@/components/leads/notes-section";
import {
  LeadVehiclesSection,
  type LeadVehicleItem,
} from "@/components/leads/lead-vehicles-section";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import {
  TasksSection,
  type LeadTask,
} from "@/components/leads/tasks-section";
import { TrackingCard } from "@/components/leads/tracking-card";
import {
  VisitsSection,
  type LeadVisit,
} from "@/components/leads/visits-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import {
  LEAD_PAYMENT_LABELS,
  fullName,
  type LeadPaymentMethod,
} from "@/lib/leads";
import { formatARS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function AdminLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [
    { data: lead },
    { data: notes },
    { data: tasks },
    { data: visits },
    { data: leadVehicles },
    team,
  ] = await Promise.all([
      supabase
        .from("leads")
        .select(
          `
            *,
            branches:branch_id (name),
            product_types:product_type_id (name),
            campaigns:campaign_id (name, origin),
            assignee:profiles!assigned_user_id (first_name, last_name),
            created_by_user:profiles!created_by (first_name, last_name, role)
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
            activity_type,
            author:profiles!author_id (first_name, last_name)
          `,
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_tasks")
        .select(
          `id, title, task_type, description, priority, due_date,
           completed_at, assigned_to,
           assignee:profiles!assigned_to (first_name, last_name)`,
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("visits")
        .select(
          `id, scheduled_at, notes, status, assigned_to,
           assignee:profiles!assigned_to (first_name, last_name)`,
        )
        .eq("lead_id", id)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("lead_vehicles")
        .select(
          "id, vehicle_model, vehicle_version, preferred_color, notes, created_at",
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: true }),
      getAssignableSalesUsers({ companyId: profile.company_id! }),
    ]);

  if (!lead) notFound();

  const noteRows: LeadNote[] = (notes ?? []).map((n) => ({
    id: n.id,
    content: n.content,
    created_at: n.created_at,
    activity_type: n.activity_type ?? null,
    author: n.author ?? null,
  }));
  const taskRows: LeadTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    task_type: t.task_type,
    title: t.title,
    description: t.description,
    priority: t.priority,
    due_date: t.due_date,
    completed_at: t.completed_at,
    assigned_to: t.assigned_to,
    assignee_name: t.assignee
      ? fullName(t.assignee.first_name, t.assignee.last_name)
      : null,
  }));
  const visitRows: LeadVisit[] = (visits ?? []).map((v) => ({
    id: v.id,
    scheduled_at: v.scheduled_at,
    notes: v.notes,
    status: v.status,
    assigned_to: v.assigned_to,
    assignee_name: v.assignee
      ? fullName(v.assignee.first_name, v.assignee.last_name)
      : null,
  }));

  // Admin: puede asignar tareas/visitas a cualquier sales activo de la empresa.
  const assigneeOptions = team.map((u) => ({
    id: u.id,
    name: fullName(u.first_name, u.last_name),
  }));
  const leadAssigneeName = lead.assignee
    ? fullName(lead.assignee.first_name, lead.assignee.last_name)
    : null;
  const vehicleRows: LeadVehicleItem[] = (leadVehicles ?? []).map((v) => ({
    id: v.id,
    vehicle_model: v.vehicle_model,
    vehicle_version: v.vehicle_version,
    preferred_color: v.preferred_color,
    notes: v.notes,
    created_at: v.created_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
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
              Cargado el{" "}
              {new Date(lead.created_at).toLocaleDateString("es-AR")}
            </span>
            {lead.created_by_user && (
              <>
                <span>·</span>
                <span>
                  por{" "}
                  {fullName(
                    lead.created_by_user.first_name,
                    lead.created_by_user.last_name,
                  )}
                </span>
              </>
            )}
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
              <CardTitle>Datos del cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Teléfono" value={lead.phone} />
              <Detail label="Email" value={lead.email} />
              <Detail label="Ciudad" value={lead.city} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vehículo de interés</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Modelo" value={lead.vehicle_model} />
              <Detail label="Versión" value={lead.vehicle_version} />
              <Detail label="Color" value={lead.preferred_color} />
              <Detail
                label="Presupuesto"
                value={
                  lead.budget_min || lead.budget_max
                    ? formatARS(lead.budget_min) + " - " + formatARS(lead.budget_max)
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
              <Detail
                label="Tiene usado"
                value={lead.has_used_car ? "Sí" : "No"}
              />
              {lead.initial_notes && (
                <div className="col-span-2">
                  <Detail label="Notas iniciales" value={lead.initial_notes} />
                </div>
              )}
            </CardContent>
          </Card>

          <LeadVehiclesSection leadId={lead.id} vehicles={vehicleRows} />

          <Card>
            <CardHeader>
              <CardTitle>Routing comercial</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Sucursal" value={lead.branches?.name} />
              <Detail label="Tipo producto" value={lead.product_types?.name} />
              <Detail label="Campaña" value={lead.campaigns?.name} />
              <Detail
                label="Vendedor asignado"
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

          <TrackingCard
            data={{
              utm_source: lead.utm_source,
              utm_medium: lead.utm_medium,
              utm_campaign: lead.utm_campaign,
              utm_term: lead.utm_term,
              utm_content: lead.utm_content,
              landing_url: lead.landing_url,
              referrer: lead.referrer,
            }}
          />

          <TasksSection
            leadId={lead.id}
            tasks={taskRows}
            currentUserId={profile.id}
            currentRole="admin"
            assigneeOptions={assigneeOptions}
          />
          <VisitsSection
            leadId={lead.id}
            visits={visitRows}
            currentUserId={profile.id}
            currentRole="admin"
            assigneeOptions={assigneeOptions}
            defaultAssigneeId={lead.assigned_user_id}
            defaultAssigneeName={leadAssigneeName}
          />
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

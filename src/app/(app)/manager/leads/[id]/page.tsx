import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import { ActivitySection } from "@/components/leads/activity-section";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import type { LeadNote } from "@/components/leads/notes-section";
import { ArchiveLeadButton } from "@/components/leads/archive-lead-button";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import { StatusChanger } from "@/components/leads/status-changer";
import {
  TemperatureBadge,
  TemperatureChanger,
} from "@/components/leads/temperature-control";
import { TemplatesModal } from "@/components/leads/templates-modal";
import type { LeadTask } from "@/components/leads/tasks-section";
import { TrackingCard } from "@/components/leads/tracking-card";
import type { LeadVisit } from "@/components/leads/visits-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actingManagerId, requireRole } from "@/lib/auth";
import {
  LEAD_PAYMENT_LABELS,
  fullName,
  type LeadPaymentMethod,
} from "@/lib/leads";
import { formatARS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function ManagerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  const [
    { data: lead },
    { data: notes },
    { data: tasks },
    { data: visits },
    team,
    { data: company },
    { data: templates },
  ] = await Promise.all([
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
            activity_type,
            author:profiles!author_id (first_name, last_name)
          `,
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_tasks")
        .select(
          `id, title, task_type, description, priority, due_date, due_time,
           completed_at, created_at, assigned_to,
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
      getAssignableSalesUsers({
        companyId: profile.company_id!,
        managerId: actingManagerId(profile),
      }),
      profile.company_id
        ? supabase
            .from("companies")
            .select("name, phone")
            .eq("id", profile.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("message_templates")
        .select("id, label, body, scope")
        .order("scope", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (!lead) notFound();

  const templateRows = (templates ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    body: t.body,
    scope: t.scope as "global" | "user",
  }));

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
    due_time: t.due_time,
    completed_at: t.completed_at,
    created_at: t.created_at,
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
  const assigneeOptions = team.map((u) => ({
    id: u.id,
    name: fullName(u.first_name, u.last_name),
  }));
  const leadAssigneeName = lead.assignee
    ? fullName(lead.assignee.first_name, lead.assignee.last_name)
    : null;

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
            {lead.temperature && (
              <TemperatureBadge temperature={lead.temperature} />
            )}
            <span>·</span>
            <span>
              {new Date(lead.created_at).toLocaleDateString("es-AR")}
            </span>
          </div>
        </div>
        {/* El gerente/supervisor opera el lead igual que un vendedor:
            estado, temperatura, mensajería; además puede reasignar. */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChanger leadId={lead.id} current={lead.status} />
          <TemperatureChanger leadId={lead.id} current={lead.temperature} />
          <TemplatesModal
            leadId={lead.id}
            templates={templateRows}
            trigger={
              <Button className="bg-[#25D366] text-white hover:bg-[#1ebe5d]">
                <WhatsappIcon className="mr-2 size-4" /> Enviar mensaje
              </Button>
            }
            leadPhone={lead.phone}
            context={{
              nombre: lead.first_name ?? "",
              nombre_completo: fullName(lead.first_name, lead.last_name),
              vendedor: fullName(profile.first_name, profile.last_name),
              vehiculo: lead.vehicle_model ?? "el vehículo",
              concesionaria: company?.name ?? "",
              telefono_concesionaria: company?.phone ?? "",
            }}
          />
          <ReassignDialog
            leadId={lead.id}
            leadProductTypeId={lead.product_type_id}
            currentAssigneeId={lead.assigned_user_id}
            users={team}
            trigger={<Button variant="outline">Reasignar</Button>}
          />
          <ArchiveLeadButton
            leadId={lead.id}
            archived={Boolean(lead.archived_at)}
          />
        </div>
      </header>

      <div className="flex flex-col gap-4">
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

          <ActivitySection
            leadId={lead.id}
            notes={noteRows}
            tasks={taskRows}
            visits={visitRows}
            currentUserId={profile.id}
            currentRole="manager"
            assigneeOptions={assigneeOptions}
            defaultAssigneeId={lead.assigned_user_id}
            defaultAssigneeName={leadAssigneeName}
          />
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

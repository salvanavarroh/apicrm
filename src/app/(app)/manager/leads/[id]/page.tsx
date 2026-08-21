import { Car, ChevronLeft, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import { ActivitySection } from "@/components/leads/activity-section";
import { LeadConversationCard } from "@/components/leads/lead-conversation-card";
import {
  FichaSection,
  LeadBusinessCard,
} from "@/components/leads/ficha-blocks";
import { InterestsSection } from "@/components/leads/interests-section";
import { EditContactDialog } from "@/components/leads/edit-contact-dialog";
import { LeadIdentityHeader } from "@/components/leads/lead-identity-header";
import { UsedCarSection } from "@/components/used-prices/used-car-section";
import { listLeadValuations } from "@/app/(app)/admin/valuations/actions";
import { NextBestActionCard } from "@/components/leads/next-best-action-card";
import type { LeadNote } from "@/components/leads/notes-section";
import { ArchiveLeadButton } from "@/components/leads/archive-lead-button";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import { StatusChanger } from "@/components/leads/status-changer";
import { TemperatureChanger } from "@/components/leads/temperature-control";
import { TemplatesModal } from "@/components/leads/templates-modal";
import type { LeadTask } from "@/components/leads/tasks-section";
import { TrackingCard } from "@/components/leads/tracking-card";
import type { LeadVisit } from "@/components/leads/visits-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { actingManagerId, requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { nextBestAction } from "@/lib/next-best-action";
import { createClient } from "@/lib/supabase/server";
import { loadLeadConversations } from "@/lib/lead-conversations";
import { getAssignableSalesUsers } from "@/lib/team";

// `Date.now()` fuera del render: lo prohíbe react-hooks/purity.
function nowMs(): number {
  return Date.now();
}

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
    { data: quotes },
    { data: leadSales },
    { data: interests },
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
      // Presupuestos y venta abierta: sólo para calcular la próxima acción.
      supabase
        .from("quotes")
        .select("created_at, sent_at")
        .eq("lead_id", id),
      supabase.from("sales").select("status").eq("lead_id", id),
      supabase.from("lead_interests").select("*").eq("lead_id", id),
    ]);

  if (!lead) notFound();

  const conversations = await loadLeadConversations(id, profile.company_id!);

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

  const nba = nextBestAction({
    lead: {
      status: lead.status,
      temperature: lead.temperature,
      created_at: lead.created_at,
      status_changed_at: lead.status_changed_at,
      last_contacted_at: lead.last_contacted_at,
      assigned_user_id: lead.assigned_user_id,
    },
    tasks: taskRows,
    visits: visitRows,
    quotes: quotes ?? [],
    birthdays: (interests ?? [])
      .filter((i) => i.kind === "cumpleanos")
      .map((i) => ({ day: i.day, month: i.month })),
    activeSaleStatus:
      (leadSales ?? []).find((s) => s.status === "evaluating")?.status ?? null,
  });

  // Tasaciones del usado. Va aparte del Promise.all de arriba porque pasa por

  // la server action (que ya resuelve rol y empresa).

  const valuations = await listLeadValuations(lead.id);


  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/manager/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <LeadIdentityHeader
        firstName={lead.first_name}
        lastName={lead.last_name}
        status={lead.status}
        temperature={lead.temperature}
        createdAt={lead.created_at}
        statusChangedAt={lead.status_changed_at}
        lastContactedAt={lead.last_contacted_at}
        phone={lead.phone}
        email={lead.email}
        contactEditor={
          <EditContactDialog
            leadId={lead.id}
            phone={lead.phone}
            email={lead.email}
          />
        }
        city={lead.city}
        vehicle={
          [lead.vehicle_model, lead.vehicle_version].filter(Boolean).join(" ") ||
          null
        }
        assigneeName={leadAssigneeName}
        actions={
          <>
          <StatusChanger leadId={lead.id} current={lead.status} />
          <TemperatureChanger leadId={lead.id} current={lead.temperature} />
          <TemplatesModal
            leadId={lead.id}
            templates={templateRows}
            trigger={
              <Button className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90">
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
          </>
        }
      />

      <NextBestActionCard action={nba} />

      {/* ---- LA GESTIÓN ---- */}
      <FichaSection icon={ListChecks} title="La gestión">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <InterestsSection leadId={lead.id} interests={interests ?? []} />
          </Card>
          <UsedCarSection
            leadId={lead.id}
            valuations={valuations}
            now={nowMs()}
          />
          <LeadConversationCard conversations={conversations} />
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
      </FichaSection>

      {/* ---- EL NEGOCIO ---- */}
      <FichaSection icon={Car} title="El negocio">
        <LeadBusinessCard
          lead={{
            vehicle_model: lead.vehicle_model,
            vehicle_version: lead.vehicle_version,
            preferred_color: lead.preferred_color,
            budget_min: lead.budget_min,
            budget_max: lead.budget_max,
            declared_payment_method: lead.declared_payment_method,
            has_used_car: lead.has_used_car,
            used_car_description: lead.used_car_description,
            initial_notes: lead.initial_notes,
            branch_name: lead.branches?.name ?? null,
            product_type_name: lead.product_types?.name ?? null,
          }}
        />
      </FichaSection>

      {/* ---- Atribución colapsada ---- */}
      <TrackingCard
        collapsible
        data={{
          source: lead.source,
          campaign: lead.campaigns?.name ?? null,
          utm_source: lead.utm_source,
          utm_medium: lead.utm_medium,
          utm_campaign: lead.utm_campaign,
          utm_term: lead.utm_term,
          utm_content: lead.utm_content,
          landing_url: lead.landing_url,
          referrer: lead.referrer,
        }}
      />
    </div>
  );
}

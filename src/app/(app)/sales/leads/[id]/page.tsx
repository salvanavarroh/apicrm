import { Car, ChevronLeft, FileText, ListChecks, Plus } from "lucide-react";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivitySection } from "@/components/leads/activity-section";
import { LeadConversationCard } from "@/components/leads/lead-conversation-card";
import {
  FichaSection,
  LeadBusinessCard,
  QUOTE_MODALITY_LABELS,
  QuoteExpiryChip,
} from "@/components/leads/ficha-blocks";
import { InterestsSection } from "@/components/leads/interests-section";
import { interestValue } from "@/lib/lead-interests";
import { LeadIdentityHeader } from "@/components/leads/lead-identity-header";
import { NextBestActionCard } from "@/components/leads/next-best-action-card";
import type { LeadNote } from "@/components/leads/notes-section";
import { StatusChanger } from "@/components/leads/status-changer";
import { TemperatureChanger } from "@/components/leads/temperature-control";
import { StartSaleButton } from "./start-sale-button";
import { ResubmitSaleButton } from "./resubmit-sale-button";
import {
  SaleDocuments,
  type SaleDoc,
} from "@/components/sales/sale-documents";
import type { LeadTask } from "@/components/leads/tasks-section";
import { TrackingCard } from "@/components/leads/tracking-card";
import type { LeadVisit } from "@/components/leads/visits-section";
import { TemplatesModal } from "@/components/leads/templates-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { formatARS } from "@/lib/format";
import { nextBestAction } from "@/lib/next-best-action";
import { loadSaleDocs } from "@/lib/sale-docs";
import { createClient } from "@/lib/supabase/server";
import { loadLeadConversations } from "@/lib/lead-conversations";

export default async function SalesLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const [
    { data: lead },
    { data: notes },
    { data: tasks },
    { data: visits },
    { data: company },
    { data: quotes },
    { data: sales },
    { data: interests },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
            *,
            branches:branch_id (name, phone),
            product_types:product_type_id (name),
            campaigns:campaign_id (name)
          `,
      )
      .eq("id", id)
      .eq("assigned_user_id", profile.id)
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
    profile.company_id
      ? supabase
          .from("companies")
          .select("name, phone")
          .eq("id", profile.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("quotes")
      .select(
        "id, modality, total, total_to_pay, created_at, sent_at, valid_until, pdf_path",
      )
      .eq("lead_id", id)
      .eq("vendor_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sales")
      .select(
        "id, status, final_price, started_at, resolved_at, rejection_reason, general_comment, scoring_comment, documentation_comment, payment_comment, commission_percent_snapshot",
      )
      .eq("lead_id", id)
      .eq("vendor_id", profile.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("lead_interests")
      .select("*")
      .eq("lead_id", id),
    supabase
      .from("message_templates")
      .select("id, label, body, scope")
      .order("scope", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
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

  const saleRows = sales ?? [];
  const activeSale = saleRows.find((s) => s.status === "evaluating") ?? null;
  const hasQuotedAvailable = lead.status === "quoted";

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
    activeSaleStatus: activeSale?.status ?? null,
  });

  // Documentación por venta (con signed URLs).
  const saleDocs = new Map<string, SaleDoc[]>();
  await Promise.all(
    saleRows.map(async (s) => {
      saleDocs.set(s.id, await loadSaleDocs(supabase, s.id));
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/sales/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver al pipeline
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
        city={lead.city}
        vehicle={
          [lead.vehicle_model, lead.vehicle_version].filter(Boolean).join(" ") ||
          null
        }
        actions={
          <>
            {hasQuotedAvailable &&
              quotes &&
              quotes.length > 0 &&
              !activeSale && (
                <StartSaleButton
                  leadId={lead.id}
                  quotes={quotes.map((q) => ({
                    id: q.id,
                    // Para el botón "Iniciar venta" mostramos LO QUE PAGA EL
                    // CLIENTE (con intereses si es financed).
                    total: Number(q.total_to_pay ?? q.total),
                    modality: q.modality,
                    created_at: q.created_at,
                  }))}
                />
              )}
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
                // Datos para romper el hielo. Si no están cargados, la línea de
                // la plantilla que los use se descarta.
                cuadro: interestValue(interests, "cuadro"),
                familia: interestValue(interests, "familia"),
                hobby: interestValue(interests, "hobby"),
              }}
            />
          </>
        }
      />

      <NextBestActionCard action={nba} />

      {/* ---- LA GESTIÓN: va primero porque es lo que se viene a buscar ---- */}
      <FichaSection icon={ListChecks} title="La gestión">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <InterestsSection
              leadId={lead.id}
              interests={interests ?? []}
            />
          </Card>
          <LeadConversationCard conversations={conversations} />
          <ActivitySection
            leadId={lead.id}
            notes={noteRows}
            tasks={taskRows}
            visits={visitRows}
            currentUserId={profile.id}
            currentRole="sales"
            assigneeOptions={[]}
            defaultAssigneeId={profile.id}
            defaultAssigneeName={fullName(profile.first_name, profile.last_name)}
          />
        </div>
      </FichaSection>

      {/* ---- EL NEGOCIO ---- */}
      <FichaSection icon={Car} title="El negocio">
        <div className="flex flex-col gap-4">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Presupuestos</CardTitle>
              <Button size="sm" asChild>
                <Link href={`/sales/leads/${lead.id}/quote/new`}>
                  <Plus className="mr-1 size-3.5" /> Generar
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!quotes || quotes.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Sin presupuestos. Generá el primero.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {/* Los presupuestos se numeran por orden de creación: un
                      vendedor puede decir "el presupuesto 2" por teléfono, no
                      "#a3f4b1c9". */}
                  {quotes.map((q, i) => {
                    return (
                      <li
                        key={q.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                      >
                        <Link
                          href={`/sales/leads/${lead.id}/quote/${q.id}`}
                          className="flex min-w-0 items-center gap-2 hover:underline"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">
                            Presupuesto #{quotes.length - i}
                            {q.modality
                              ? ` — ${QUOTE_MODALITY_LABELS[q.modality] ?? q.modality}`
                              : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(q.created_at).toLocaleDateString("es-AR")}
                          </span>
                        </Link>
                        <div className="flex items-center gap-2 text-xs">
                          <QuoteExpiryChip validUntil={q.valid_until} />
                          <span className="font-mono font-semibold tabular-nums">
                            {formatARS(q.total_to_pay ?? q.total)}
                          </span>
                          {q.sent_at && (
                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                              Enviado
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {saleRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Estado de venta</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {saleRows.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-md border bg-card px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        Venta #{s.id.slice(0, 8)} ·{" "}
                        <span className="font-mono">
                          {formatARS(s.final_price)}
                        </span>
                      </span>
                      <SaleStateBadge status={s.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Iniciada{" "}
                      {new Date(s.started_at).toLocaleDateString("es-AR")}
                      {s.resolved_at && (
                        <>
                          {" "}
                          · Resuelta{" "}
                          {new Date(s.resolved_at).toLocaleDateString("es-AR")}
                        </>
                      )}
                    </p>
                    {s.status === "evaluating" && (
                      <p className="mt-2 rounded bg-warning/15 px-2 py-1 text-xs text-warning-text">
                        Esperando aprobación del gerente. No podés iniciar otra
                        venta hasta que esta se resuelva.
                      </p>
                    )}
                    {s.status === "rejected" && s.rejection_reason && (
                      <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <strong>Motivo:</strong> {s.rejection_reason}
                      </p>
                    )}

                    {/* Documentación de la venta (subir/ver/borrar). */}
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Documentación
                      </p>
                      <SaleDocuments
                        saleId={s.id}
                        companyId={profile.company_id!}
                        docs={saleDocs.get(s.id) ?? []}
                        canEdit={s.status !== "accepted"}
                      />
                    </div>

                    {s.status === "rejected" && (
                      <ResubmitSaleButton saleId={s.id} />
                    )}
                    {s.status === "accepted" && (
                      <p className="mt-2 rounded bg-success/10 px-2 py-1 text-xs text-success">
                        Venta aprobada
                        {s.commission_percent_snapshot !== null
                          ? ` · Comisión congelada en ${s.commission_percent_snapshot}%`
                          : ""}
                      </p>
                    )}
                    {(s.scoring_comment ||
                      s.documentation_comment ||
                      s.payment_comment ||
                      s.general_comment) && (
                      <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                        {s.scoring_comment && (
                          <li>
                            <strong>Scoring:</strong> {s.scoring_comment}
                          </li>
                        )}
                        {s.documentation_comment && (
                          <li>
                            <strong>Documentación:</strong>{" "}
                            {s.documentation_comment}
                          </li>
                        )}
                        {s.payment_comment && (
                          <li>
                            <strong>Pago:</strong> {s.payment_comment}
                          </li>
                        )}
                        {s.general_comment && (
                          <li>
                            <strong>Observación:</strong> {s.general_comment}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        </div>
      </FichaSection>

      {/* ---- Atribución: colapsada, es plomería de marketing ---- */}
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
function SaleStateBadge({
  status,
}: {
  status: "evaluating" | "accepted" | "rejected";
}) {
  const map = {
    evaluating: {
      label: "En evaluación",
      cls: "bg-warning/15 text-warning-text",
    },
    accepted: { label: "Aprobada", cls: "bg-success/10 text-success" },
    rejected: { label: "Rechazada", cls: "bg-destructive/10 text-destructive" },
  } as const;
  const m = map[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

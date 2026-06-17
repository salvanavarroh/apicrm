import { ChevronLeft, FileText, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import {
  NotesSection,
  type LeadNote,
} from "@/components/leads/notes-section";
import { StatusChanger } from "@/components/leads/status-changer";
import {
  TemperatureBadge,
  TemperatureChanger,
} from "@/components/leads/temperature-control";
import { StartSaleButton } from "./start-sale-button";
import {
  TasksSection,
  type LeadTask,
} from "@/components/leads/tasks-section";
import { TrackingCard } from "@/components/leads/tracking-card";
import {
  VisitsSection,
  type LeadVisit,
} from "@/components/leads/visits-section";
import { TemplatesModal } from "@/components/leads/templates-modal";
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

  const saleRows = sales ?? [];
  const activeSale = saleRows.find((s) => s.status === "evaluating") ?? null;
  const hasQuotedAvailable = lead.status === "quoted";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/sales/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver al pipeline
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
              {lead.vehicle_model || "—"}
              {lead.vehicle_version ? ` ${lead.vehicle_version}` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasQuotedAvailable && quotes && quotes.length > 0 && !activeSale && (
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
            trigger={
              <Button variant="outline">
                <MessageCircle className="mr-2 size-4" /> Plantillas
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
        </div>
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
              {lead.has_used_car && lead.used_car_description && (
                <div className="col-span-2">
                  <Detail
                    label="Descripción del usado"
                    value={lead.used_car_description}
                  />
                </div>
              )}
              {lead.initial_notes && (
                <div className="col-span-2">
                  <Detail label="Notas iniciales" value={lead.initial_notes} />
                </div>
              )}
            </CardContent>
          </Card>

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
                  {quotes.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                    >
                      <Link
                        href={`/sales/leads/${lead.id}/quote/${q.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          #{q.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(q.created_at).toLocaleDateString("es-AR")}
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono">
                          {formatARS(q.total_to_pay ?? q.total)}
                        </span>
                        {q.sent_at && (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                            Enviado
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
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
                      <p className="mt-2 rounded bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
                        Esperando aprobación del Admin. No podés iniciar otra
                        venta hasta que esta se resuelva.
                      </p>
                    )}
                    {s.status === "rejected" && s.rejection_reason && (
                      <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <strong>Motivo:</strong> {s.rejection_reason}
                      </p>
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
            currentRole="sales"
            assigneeOptions={[]}
          />
          <VisitsSection
            leadId={lead.id}
            visits={visitRows}
            currentUserId={profile.id}
            currentRole="sales"
            assigneeOptions={[]}
            defaultAssigneeId={profile.id}
            defaultAssigneeName={fullName(profile.first_name, profile.last_name)}
          />
        </div>

        <div className="flex flex-col gap-4">
          <NotesSection leadId={lead.id} notes={noteRows} />
        </div>
      </div>
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
      cls: "bg-warning/10 text-warning-foreground",
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

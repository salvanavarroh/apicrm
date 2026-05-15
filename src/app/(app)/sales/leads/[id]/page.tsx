import { ChevronLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  NotesSection,
  type LeadNote,
} from "@/components/leads/notes-section";
import { StatusChanger } from "@/components/leads/status-changer";
import {
  TasksSection,
  type LeadTask,
} from "@/components/leads/tasks-section";
import { TemplatesModal } from "@/components/leads/templates-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import {
  LEAD_PAYMENT_LABELS,
  fullName,
  type LeadPaymentMethod,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export default async function SalesLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const [{ data: lead }, { data: notes }, { data: tasks }, { data: company }] =
    await Promise.all([
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
      profile.company_id
        ? supabase
            .from("companies")
            .select("name, phone")
            .eq("id", profile.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
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
          <p className="mt-1 text-sm text-muted-foreground">
            {lead.vehicle_model || "—"}
            {lead.vehicle_version ? ` · ${lead.vehicle_version}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChanger leadId={lead.id} current={lead.status} />
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
            <CardHeader>
              <CardTitle>Generar presupuesto</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              El módulo de presupuestos se habilita en Sprint 6.
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

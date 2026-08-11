import { Building2, ChevronLeft, Mail, Phone, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrackingCard } from "@/components/leads/tracking-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import { CommercialLeadActions } from "./lead-actions";
import { CommercialNotesSection } from "./notes-section";

export default async function SuperAdminLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["super_admin"]);
  const supabase = await createClient();

  const [{ data: lead }, { data: notes }] = await Promise.all([
    supabase
      .from("commercial_leads")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("commercial_lead_notes")
      .select(
        `id, content, created_at,
         author:profiles!author_id (first_name, last_name)`,
      )
      .eq("commercial_lead_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!lead) notFound();

  const name = fullName(lead.first_name, lead.last_name) || lead.email;
  const noteRows = (notes ?? []).map((n) => ({
    id: n.id,
    content: n.content,
    created_at: n.created_at,
    author: n.author ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/super-admin/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {lead.company_name ?? "Empresa no informada"} ·{" "}
            <a
              href={`mailto:${lead.email}`}
              className="underline-offset-2 hover:underline"
            >
              {lead.email}
            </a>
            {lead.phone && (
              <>
                {" "}
                ·{" "}
                <a
                  href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
                  className="underline-offset-2 hover:underline"
                >
                  {lead.phone}
                </a>
              </>
            )}
          </p>
        </div>
        <CommercialLeadActions leadId={lead.id} currentStatus={lead.status} />
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Datos del contacto</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Detail
                icon={<Mail className="size-3.5" />}
                label="Email"
                value={lead.email}
              />
              <Detail
                icon={<Phone className="size-3.5" />}
                label="Teléfono"
                value={lead.phone}
              />
              <Detail
                icon={<Building2 className="size-3.5" />}
                label="Empresa"
                value={lead.company_name}
              />
              <Detail
                icon={<Users className="size-3.5" />}
                label="Equipo de ventas"
                value={lead.team_size}
              />
              {lead.message && (
                <div className="col-span-2">
                  <Detail label="Mensaje" value={lead.message} multiline />
                </div>
              )}
              <Detail
                label="Recibido el"
                value={new Date(lead.created_at).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              />
              <Detail
                label="Última actualización"
                value={new Date(lead.updated_at).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              />
            </CardContent>
          </Card>

          <TrackingCard
            collapsible
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
        </div>

        <div className="flex flex-col gap-4">
          <CommercialNotesSection leadId={lead.id} notes={noteRows} />
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
  multiline,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={
          multiline
            ? "whitespace-pre-line text-sm text-foreground"
            : "truncate text-sm text-foreground"
        }
      >
        {value ?? <span className="text-muted-foreground/60">—</span>}
      </span>
    </div>
  );
}

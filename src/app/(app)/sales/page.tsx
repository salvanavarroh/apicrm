import { ChevronRight, Layers, MessageCircle } from "lucide-react";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { AgendaCalendar } from "@/components/dashboard/agenda-calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import {
  loadAgendaForCompany,
  todayDateKey,
} from "@/lib/tasks-visits-loader";

export default async function SalesHomePage() {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const agendaItems = profile.company_id
    ? await loadAgendaForCompany(profile.company_id, {
        leadBasePath: "/sales/leads",
        onlyAssignedTo: profile.id,
      })
    : [];
  const today = todayDateKey();

  const [
    { count: total },
    { count: newCount },
    { count: contacted },
    { count: quoted },
    { data: recent },
    { data: salesMonth },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id)
      .eq("status", "new"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id)
      .eq("status", "contacted"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_user_id", profile.id)
      .eq("status", "quoted"),
    supabase
      .from("leads")
      .select(
        `
          id,
          first_name,
          last_name,
          phone,
          vehicle_model,
          status,
          created_at
        `,
      )
      .eq("assigned_user_id", profile.id)
      .in("status", ["new", "contacted", "interested", "quoted"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("sales")
      .select("id, status, final_price, commission_percent_snapshot, started_at")
      .eq("vendor_id", profile.id)
      .gte("started_at", monthStart.toISOString()),
  ]);

  const accepted = (salesMonth ?? []).filter((s) => s.status === "accepted");
  const ganancia = accepted.reduce((acc, s) => {
    const pct = Number(s.commission_percent_snapshot) || 0;
    return acc + Number(s.final_price) * (pct / 100);
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {profile.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Tu día arranca con {newCount ?? 0} lead(s) nuevo(s) por contactar.
        </p>
      </header>

      <AgendaCalendar items={agendaItems} todayKey={today} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Mis leads" value={total ?? 0} />
        <Stat label="Nuevos" value={newCount ?? 0} />
        <Stat label="Presupuestados" value={quoted ?? 0} />
        <Stat
          label="Ventas del mes"
          value={accepted.length}
          hint={
            ganancia > 0
              ? `Ganancia: ${formatARS(ganancia)}`
              : `${contacted ?? 0} contactados`
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Leads recientes</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sales/leads">
                Ver todos <ChevronRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>
          {recent && recent.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {recent.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <Link
                    href={`/sales/leads/${lead.id}`}
                    className="flex-1 hover:underline"
                  >
                    <p className="font-medium">
                      {fullName(lead.first_name, lead.last_name)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lead.vehicle_model ?? "—"} · {lead.phone ?? "—"}
                    </p>
                  </Link>
                  <LeadStatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No tenés leads pendientes.
            </p>
          )}
        </Card>

      </div>

      <div className="flex gap-2">
        <Button asChild>
          <Link href="/sales/leads">
            <Layers className="mr-2 size-4" /> Abrir pipeline
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/profile">
            <MessageCircle className="mr-2 size-4" /> Mi perfil
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </Card>
  );
}

import { ChevronRight, ClipboardList, Layers, MessageCircle } from "lucide-react";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export default async function SalesHomePage() {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [
    { count: total },
    { count: newCount },
    { count: contacted },
    { count: quoted },
    { data: recent },
    { data: tasksToday },
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
      .from("lead_tasks")
      .select(
        `
          id,
          title,
          priority,
          due_date,
          completed_at,
          lead:leads (id, first_name, last_name)
        `,
      )
      .is("completed_at", null)
      .lt("due_date", tomorrowStart.toISOString())
      .order("due_date", { ascending: true })
      .limit(5),
  ]);

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

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Mis leads" value={total ?? 0} />
        <Stat label="Nuevos" value={newCount ?? 0} />
        <Stat label="Contactados" value={contacted ?? 0} />
        <Stat label="Presupuestados" value={quoted ?? 0} />
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

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tareas del día</h2>
            <ClipboardList className="size-4 text-muted-foreground" />
          </div>
          {tasksToday && tasksToday.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {tasksToday.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.lead
                      ? fullName(t.lead.first_name, t.lead.last_name)
                      : "—"}
                    {t.due_date &&
                      ` · vence ${new Date(t.due_date).toLocaleDateString("es-AR")}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Sin tareas vencidas. ¡Bien ahí!
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

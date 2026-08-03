import { ChevronRight, Layers, MessageCircle } from "lucide-react";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { AgendaCalendar } from "@/components/dashboard/agenda-calendar";
import { PresenceToggle } from "@/components/inbox/presence-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { loadInboxPresence } from "@/lib/messaging/presence";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const presence = profile.company_id
    ? await loadInboxPresence(profile.id, profile.company_id)
    : { available: false, activeCount: 0 };

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

  // Ranking de vendedores del mes (competencia sana). El vendedor no puede leer
  // ventas de otros por RLS → admin client, scopeado a su empresa.
  type RankRow = { id: string; name: string; sales: number; revenue: number };
  let ranking: RankRow[] = [];
  if (profile.company_id) {
    const admin = createAdminClient();
    const [{ data: monthSales }, { data: vendors }] = await Promise.all([
      admin
        .from("sales")
        .select("vendor_id, final_price, status, started_at")
        .eq("company_id", profile.company_id)
        .eq("status", "accepted")
        .gte("started_at", monthStart.toISOString()),
      admin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", profile.company_id)
        .eq("role", "sales")
        .neq("status", "deleted"),
    ]);
    const agg = new Map<string, { sales: number; revenue: number }>();
    for (const s of monthSales ?? []) {
      if (!s.vendor_id) continue;
      const cur = agg.get(s.vendor_id) ?? { sales: 0, revenue: 0 };
      cur.sales += 1;
      cur.revenue += Number(s.final_price);
      agg.set(s.vendor_id, cur);
    }
    const nameById = new Map(
      (vendors ?? []).map((v) => [v.id, fullName(v.first_name, v.last_name)]),
    );
    ranking = [...agg.entries()]
      .map(([id, a]) => ({ id, name: nameById.get(id) ?? "—", ...a }))
      .sort((x, y) => y.sales - x.sales || y.revenue - x.revenue);
  }
  // Top 5 + mi fila si quedé afuera (para que siempre me vea).
  const topRanking = ranking.slice(0, 5).map((r, i) => ({ ...r, rank: i + 1 }));
  const myIdx = ranking.findIndex((r) => r.id === profile.id);
  const rankingRows =
    myIdx >= 5
      ? [...topRanking, { ...ranking[myIdx], rank: myIdx + 1 }]
      : topRanking;

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

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Recepción de conversaciones</p>
          <p className="text-xs text-muted-foreground">
            Activate para recibir conversaciones nuevas del inbox por reparto
            automático (round-robin).
            {presence.activeCount > 0 &&
              ` Ahora hay ${presence.activeCount} vendedor(es) activo(s).`}
          </p>
        </div>
        <PresenceToggle
          initialAvailable={presence.available}
          activeCount={presence.activeCount}
        />
      </Card>

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

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ranking del mes</h2>
            <span className="text-[11px] text-muted-foreground">
              Ventas aprobadas
            </span>
          </div>
          {rankingRows.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todavía no hay ventas este mes. ¡Podés ser el primero! 🏁
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {rankingRows.map((r) => {
                const me = r.id === profile.id;
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
                      me ? "border-accent/50 bg-accent/5" : "bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 shrink-0 text-center font-mono text-xs font-semibold",
                        r.rank === 1
                          ? "text-amber-500"
                          : r.rank === 2
                            ? "text-zinc-400"
                            : r.rank === 3
                              ? "text-orange-700"
                              : "text-muted-foreground",
                      )}
                    >
                      {r.rank}º
                    </span>
                    <span className="flex-1 truncate font-medium">
                      {r.name}
                      {me && (
                        <span className="text-muted-foreground"> (vos)</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-semibold">{r.sales}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                        {formatARS(r.revenue)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
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

import { Mail, Phone } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import {
  COMMERCIAL_LEAD_STATUSES,
  COMMERCIAL_LEAD_STATUS_CLS,
  COMMERCIAL_LEAD_STATUS_LABEL,
} from "@/lib/commercial-leads";
import { createClient } from "@/lib/supabase/server";

import { CommercialLeadsTable } from "./leads-table";

export default async function SuperAdminLeadsPage() {
  await requireRole(["super_admin"]);
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("commercial_leads")
    .select(
      `id, first_name, last_name, email, company_name, phone, team_size,
       status, created_at,
       utm_source, utm_campaign`,
    )
    .order("created_at", { ascending: false });

  const rows = leads ?? [];

  // KPIs por status
  const byStatus = new Map<string, number>();
  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Concesionarias que pidieron demo desde la landing. Pipeline interno
          del SaaS.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COMMERCIAL_LEAD_STATUSES.map((s) => (
          <Card key={s} className="flex flex-col gap-1 p-4">
            <span
              className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${COMMERCIAL_LEAD_STATUS_CLS[s]}`}
            >
              {COMMERCIAL_LEAD_STATUS_LABEL[s]}
            </span>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              {byStatus.get(s) ?? 0}
            </p>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Mail className="size-5" />
            <Phone className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Todavía no llegaron leads desde la landing.
          </p>
          <p className="text-xs text-muted-foreground">
            Cuando alguien complete el form de{" "}
            <Link href="/#contacto" className="underline">
              /#contacto
            </Link>{" "}
            aparece acá.
          </p>
        </Card>
      ) : (
        <CommercialLeadsTable rows={rows} />
      )}
    </div>
  );
}

import { Plus, Upload } from "lucide-react";
import Link from "next/link";

import { LeadsTable, type LeadsTableRow } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fullName, normalizePhone } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function AdminLeadsPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data }, assignableUsers] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
        id,
        first_name,
        last_name,
        phone,
        email,
        status,
        temperature,
        city,
        vehicle_model,
        vehicle_version,
        created_at,
        last_contacted_at,
        branch_id,
        product_type_id,
        branches:branch_id (name),
        product_types:product_type_id (name),
        campaigns:campaign_id (name),
        assignee:profiles!assigned_user_id (first_name, last_name)
      `,
      )
      .eq("company_id", profile.company_id!)
      .order("created_at", { ascending: false }),
    getAssignableSalesUsers({ companyId: profile.company_id! }),
  ]);

  // Alerta de duplicados: teléfonos (normalizados) que aparecen en >1 lead.
  const phoneCounts = new Map<string, number>();
  for (const l of data ?? []) {
    const p = normalizePhone(l.phone);
    if (p) phoneCounts.set(p, (phoneCounts.get(p) ?? 0) + 1);
  }

  const rows: LeadsTableRow[] = (data ?? []).map((l) => {
    const p = normalizePhone(l.phone);
    return {
      id: l.id,
      first_name: l.first_name,
      last_name: l.last_name,
      phone: l.phone,
      email: l.email,
      status: l.status,
      temperature: l.temperature,
      city: l.city,
      vehicle_model: l.vehicle_model,
      vehicle_version: l.vehicle_version,
      branch_name: l.branches?.name ?? null,
      product_type_name: l.product_types?.name ?? null,
      campaign_name: l.campaigns?.name ?? null,
      assignee_name: l.assignee
        ? fullName(l.assignee.first_name, l.assignee.last_name)
        : null,
      created_at: l.created_at,
      last_contacted_at: l.last_contacted_at,
      is_duplicate: p ? (phoneCounts.get(p) ?? 0) > 1 : false,
    };
  });

  const poolCount = rows.filter(
    (r) => !r.branch_name || !r.product_type_name,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Todos los leads de tu empresa.
            {poolCount > 0 && (
              <>
                {" "}
                Hay{" "}
                <Link
                  href="/admin/leads/pool"
                  className="font-medium text-accent underline-offset-4 hover:underline"
                >
                  {poolCount} sin clasificar
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/leads/import">
              <Upload className="mr-2 size-4" /> Importar CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/leads/new">
              <Plus className="mr-2 size-4" /> Nuevo lead
            </Link>
          </Button>
        </div>
      </header>

      <LeadsTable
        rows={rows}
        detailHrefPrefix="/admin/leads"
        assignableUsers={assignableUsers}
        canExport
      />
    </div>
  );
}

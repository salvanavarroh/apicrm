import { Archive, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { LeadsTable } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const archived = (await searchParams).archived === "1";

  const [assignableUsers, poolRes] = await Promise.all([
    getAssignableSalesUsers({ companyId: profile.company_id! }),
    // Conteo exacto del pool (sin sucursal o sin tipo).
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id!)
      .is("archived_at", null)
      .or("branch_id.is.null,product_type_id.is.null"),
  ]);

  const poolCount = poolRes.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {archived ? "Leads archivados" : "Leads"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {archived ? (
              "Leads dados de baja. Podés desarchivarlos desde la selección."
            ) : (
              <>
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
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={archived ? "/admin/leads" : "/admin/leads?archived=1"}>
              <Archive className="mr-2 size-4" />{" "}
              {archived ? "Ver activos" : "Archivados"}
            </Link>
          </Button>
          {!archived && (
            <>
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
            </>
          )}
        </div>
      </header>

      <LeadsTable
        scope={{ archived }}
        detailHrefPrefix="/admin/leads"
        assignableUsers={assignableUsers}
        canExport
      />
    </div>
  );
}

import { Archive, Inbox, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { LeadsPageHeader } from "@/components/leads/leads-page-header";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { loadLeadFilterOptions } from "@/lib/lead-filter-options";
import { fetchLeadsSummary, fetchLeadsTable } from "@/lib/leads-table-actions";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; form?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const formId = sp.form?.trim() || undefined;

  // Si venís de Lead Ads con ?form=, filtramos por ese formulario y mostramos su
  // nombre en el aviso.
  const formRow = formId
    ? (
        await supabase
          .from("lead_ad_forms")
          .select("form_name")
          .eq("company_id", profile.company_id!)
          .eq("meta_form_id", formId)
          .maybeSingle()
      ).data
    : null;
  const formFilter = formId
    ? { id: formId, label: formRow?.form_name ?? formId }
    : undefined;

  const [assignableUsers, poolRes, initial, summary] = await Promise.all([
    getAssignableSalesUsers({ companyId: profile.company_id! }),
    // Conteo exacto del pool (sin sucursal o sin tipo).
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.company_id!)
      .is("archived_at", null)
      .or("branch_id.is.null,product_type_id.is.null"),
    fetchLeadsTable({ archived }, { form_id: formId }, 1),
    // Los contadores del banner respetan el filtro por formulario, si vino.
    fetchLeadsSummary({ archived }, { form_id: formId }),
  ]);

  const filterOptions = await loadLeadFilterOptions(
    supabase,
    profile.company_id!,
  );
  const poolCount = poolRes.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <LeadsTabs />
      <LeadsPageHeader
        icon={archived ? Archive : Inbox}
        title={archived ? "Leads archivados" : "Leads"}
        description={
          archived
            ? "Leads dados de baja. Podés desarchivarlos desde la selección."
            : "Todos los leads de tu empresa: quién los tiene, en qué estado están y cuáles necesitan atención hoy."
        }
        stats={
          archived
            ? [{ label: "Archivados", value: summary.total }]
            : [
                {
                  label: "Activos",
                  value: summary.active,
                  hint: `${summary.total.toLocaleString("es-AR")} en total`,
                },
                {
                  label: "Sin asignar",
                  value: summary.unassigned,
                  tone: summary.unassigned > 0 ? "warning" : "default",
                  hint: "Esperando vendedor",
                },
                {
                  label: "Sin gestión +7d",
                  value: summary.stale,
                  tone: summary.stale > 0 ? "danger" : "success",
                  hint: summary.stale > 0 ? "Requieren contacto" : "Todo al día",
                },
                {
                  label: "Sin clasificar",
                  value: poolCount,
                  tone: poolCount > 0 ? "accent" : "default",
                  href: poolCount > 0 ? "/admin/leads/pool" : undefined,
                  hint: "Sin sucursal o tipo",
                },
              ]
        }
        actions={
          <>
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
          </>
        }
      />


      <LeadsTable
        scope={{ archived }}
        detailHrefPrefix="/admin/leads"
        initialRows={initial.rows}
        initialTotal={initial.total}
        assignableUsers={assignableUsers}
        canExport
        branchOptions={filterOptions.branches}
        productTypeOptions={filterOptions.productTypes}
        vendorOptions={filterOptions.vendors}
        campaignOptions={filterOptions.campaigns}
        formFilter={formFilter}
      />
    </div>
  );
}

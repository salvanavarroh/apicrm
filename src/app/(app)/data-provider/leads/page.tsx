import { FileUp, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { LeadsPageHeader } from "@/components/leads/leads-page-header";
import { LeadsTable } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fetchLeadsSummary, fetchLeadsTable } from "@/lib/leads-table-actions";

export default async function DataProviderLeadsPage() {
  await requireRole(["data_provider"]);
  const [initial, summary] = await Promise.all([
    fetchLeadsTable({}, {}, 1),
    fetchLeadsSummary({}, {}),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <LeadsPageHeader
        icon={Upload}
        title="Mis cargas"
        description="Todos los leads que cargaste. Podés editar los que están en estado Nuevo."
        stats={[
          { label: "Cargados", value: summary.total },
          {
            label: "Todavía nuevos",
            value: summary.byStatus.new ?? 0,
            tone: "accent",
            hint: "Editables",
          },
          {
            label: "Ya en gestión",
            value: summary.active - (summary.byStatus.new ?? 0),
            tone: "success",
            hint: "Tomados por un vendedor",
          },
        ]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/data-provider/leads/import">
                <FileUp className="mr-2 size-4" /> Importar CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/data-provider/leads/new">
                <Plus className="mr-2 size-4" /> Nuevo lead
              </Link>
            </Button>
          </>
        }
      />

      <LeadsTable
        scope={{}}
        detailHrefPrefix="/data-provider/leads"
        initialRows={initial.rows}
        initialTotal={initial.total}
        showAssignee={false}
        editableTemperature={false}
      />
    </div>
  );
}

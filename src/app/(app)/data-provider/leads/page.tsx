import { FileUp, Plus } from "lucide-react";
import Link from "next/link";

import { LeadsTable } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fetchLeadsTable } from "@/lib/leads-table-actions";

export default async function DataProviderLeadsPage() {
  await requireRole(["data_provider"]);
  const initial = await fetchLeadsTable({}, {}, 1);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis cargas</h1>
          <p className="text-sm text-muted-foreground">
            Todos los leads que cargaste. Podés editar los que están en estado
            Nuevo.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </header>

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

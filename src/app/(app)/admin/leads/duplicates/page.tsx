import { requireRole } from "@/lib/auth";
import { DuplicatesReview } from "@/components/leads/duplicates-review";

import { getDuplicateGroups } from "./actions";

export default async function AdminLeadsDuplicatesPage() {
  await requireRole(["admin"]);
  const groups = await getDuplicateGroups();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Leads duplicados
        </h1>
        <p className="text-sm text-muted-foreground">
          Leads con el mismo teléfono (número canónico E.164). Unificá cada grupo
          en un solo lead. El sugerido es el de mayor avance o con venta; podés
          cambiarlo. La unificación mueve toda la actividad al lead que queda.
        </p>
      </header>
      <DuplicatesReview groups={groups} />
    </div>
  );
}

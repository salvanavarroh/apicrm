import { TasksVisitsView } from "@/components/tasks-visits/tasks-visits-view";
import { requireRole } from "@/lib/auth";
import { loadTasksAndVisitsForCompany } from "@/lib/tasks-visits-loader";

export default async function SalesTasksVisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireRole(["sales"]);
  if (!profile.company_id) return null;

  const { tab } = await searchParams;
  const initialTab = tab === "visits" ? "visits" : "tasks";

  // Vendedor solo ve lo asignado a él (RLS lo restringe a sus leads, +
  // filtro explícito por assigned_to por si la tarea no está asignada).
  const { tasks, visits } = await loadTasksAndVisitsForCompany(
    profile.company_id,
    { onlyAssignedTo: profile.id },
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tareas y Visitas
        </h1>
        <p className="text-sm text-muted-foreground">
          Tu agenda. Tocá una tarea o visita para abrir el lead asociado.
        </p>
      </header>

      <TasksVisitsView
        tasks={tasks}
        visits={visits}
        leadBasePath="/sales/leads"
        initialTab={initialTab}
      />
    </div>
  );
}

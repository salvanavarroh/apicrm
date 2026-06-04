import { TasksVisitsView } from "@/components/tasks-visits/tasks-visits-view";
import { requireRole } from "@/lib/auth";
import { loadTasksAndVisitsForCompany } from "@/lib/tasks-visits-loader";

export default async function ManagerTasksVisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireRole(["manager"]);
  if (!profile.company_id) return null;

  const { tab } = await searchParams;
  const initialTab = tab === "visits" ? "visits" : "tasks";

  // RLS de leads filtra por gerencias del manager → solo aparecen tareas/visitas
  // de leads dentro de su scope.
  const { tasks, visits } = await loadTasksAndVisitsForCompany(
    profile.company_id,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tareas y Visitas
        </h1>
        <p className="text-sm text-muted-foreground">
          Tareas y visitas de todos los leads de tus gerencias. Tocá una fila
          para abrir el lead.
        </p>
      </header>

      <TasksVisitsView
        tasks={tasks}
        visits={visits}
        leadBasePath="/manager/leads"
        initialTab={initialTab}
      />
    </div>
  );
}

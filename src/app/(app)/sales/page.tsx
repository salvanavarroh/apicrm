import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SalesHomePage() {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("assigned_user_id", profile.id);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {profile.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bienvenido al CRM. El pipeline completo se habilita en Sprint 5.
        </p>
      </header>

      <div className="rounded-md border p-4 text-sm">
        Tenés <span className="font-semibold">{count ?? 0}</span> lead(s)
        asignado(s). Pronto vas a poder verlos en Kanban + Tabla.
      </div>
    </div>
  );
}

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { TemplatesManager } from "./templates-manager";

export default async function SuperAdminTemplatesPage() {
  await requireRole(["super_admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("message_templates")
    .select("id, label, body")
    .eq("scope", "global")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Plantillas de mensaje
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Plantillas globales que llegan a todos los vendedores y gerentes. Cada
          vendedor puede además crear las suyas propias.
        </p>
      </header>

      <TemplatesManager templates={data ?? []} />
    </div>
  );
}

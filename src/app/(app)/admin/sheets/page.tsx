import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { listSheetSources } from "./actions";
import { SheetsView } from "./sheets-view";

export default async function SheetsPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [sources, branches, productTypes, campaigns] = await Promise.all([
    listSheetSources(),
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("product_types")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* La cabecera la dibuja SheetsView: el botón de "Conectar una planilla"
          va ahí y necesita el estado del formulario, que es del cliente. */}
      <SheetsView
        sources={sources}
        branches={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        productTypes={(productTypes.data ?? []).map((p) => ({
          id: p.id,
          label: p.name,
        }))}
        campaigns={(campaigns.data ?? []).map((c) => ({
          id: c.id,
          label: c.name,
        }))}
      />
    </div>
  );
}

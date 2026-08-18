import { Sheet } from "lucide-react";

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
      <header className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sheet className="size-6 text-accent" /> Leads desde Google Sheets
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Para las plataformas que escriben en una planilla en vez de darnos una
          API — el caso típico es TikTok Lead Gen. Revisamos la hoja cada tantos
          minutos y creamos los leads nuevos.
        </p>
      </header>

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

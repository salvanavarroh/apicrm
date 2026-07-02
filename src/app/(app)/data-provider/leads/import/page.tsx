import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { CsvImporter } from "@/components/leads/csv-importer";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportLeadsProviderPage() {
  const profile = await requireRole(["data_provider"]);
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("company_id", profile.company_id!)
    .eq("status", "active")
    .order("name");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/data-provider/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar leads desde CSV
        </h1>
        <p className="text-sm text-muted-foreground">
          Las filas se cargan al pool sin clasificar — el Admin las clasifica
          después.
        </p>
      </header>

      <Link href="/data-provider/leads/import-ai">
        <Card className="flex flex-row items-center gap-3 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Nuevo: carga con IA</p>
            <p className="text-xs text-muted-foreground">
              Subí cualquier archivo (aunque las columnas no coincidan) y la IA
              las mapea sola.
            </p>
          </div>
        </Card>
      </Link>

      <CsvImporter
        redirectTo="/data-provider/leads"
        branches={[]}
        productTypes={[]}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, label: c.name }))}
        showDefaults={false}
      />
    </div>
  );
}

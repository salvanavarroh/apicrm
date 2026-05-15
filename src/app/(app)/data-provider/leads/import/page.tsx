import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { CsvImporter } from "@/components/leads/csv-importer";
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

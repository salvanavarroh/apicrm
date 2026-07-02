import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { AiLeadImporter } from "@/components/leads/ai-lead-importer";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportLeadsAiProviderPage() {
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
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" /> Carga de leads con IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Subí cualquier CSV o Excel: la IA mapea las columnas y revisás antes de
          confirmar. Los leads se cargan al pool sin clasificar — el Admin los
          clasifica después.
        </p>
      </header>

      <AiLeadImporter
        companyId={profile.company_id!}
        redirectTo="/data-provider/leads"
        branches={[]}
        productTypes={[]}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, label: c.name }))}
        vendors={[]}
        showClassification={false}
        showDistribution={false}
      />
    </div>
  );
}

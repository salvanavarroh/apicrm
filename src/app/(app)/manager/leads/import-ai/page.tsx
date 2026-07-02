import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { AiLeadImporter } from "@/components/leads/ai-lead-importer";
import { Card } from "@/components/ui/card";
import { actingManagerId, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportLeadsAiManagerPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();
  const managerId = actingManagerId(profile);

  const { data: managements } = await supabase
    .from("managements")
    .select("branches(id, name), product_types(id, name)")
    .eq("manager_id", managerId);

  const branchMap = new Map<string, string>();
  const ptMap = new Map<string, string>();
  for (const m of managements ?? []) {
    const b = m.branches as { id: string; name: string } | null;
    const p = m.product_types as { id: string; name: string } | null;
    if (b) branchMap.set(b.id, b.name);
    if (p) ptMap.set(p.id, p.name);
  }

  const [{ data: campaigns }, { data: vendors }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("company_id", profile.company_id!)
      .eq("role", "sales")
      .eq("manager_id", managerId)
      .order("first_name"),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/manager/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" /> Carga de leads con IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Subí cualquier CSV o Excel: la IA entiende las columnas, las mapea y te
          deja revisar antes de confirmar.
        </p>
      </header>

      <Card className="p-3 text-xs text-muted-foreground">
        ¿Preferís la plantilla estructurada?{" "}
        <Link
          href="/manager/leads/import"
          className="font-medium text-foreground underline"
        >
          Importar desde CSV con columnas fijas
        </Link>
        .
      </Card>

      <AiLeadImporter
        companyId={profile.company_id!}
        redirectTo="/manager/leads"
        branches={Array.from(branchMap, ([id, label]) => ({ id, label }))}
        productTypes={Array.from(ptMap, ([id, label]) => ({ id, label }))}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, label: c.name }))}
        vendors={(vendors ?? []).map((v) => ({
          id: v.id,
          label: [v.first_name, v.last_name].filter(Boolean).join(" ") || "Sin nombre",
        }))}
      />
    </div>
  );
}

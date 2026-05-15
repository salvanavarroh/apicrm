import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { CsvImporter } from "@/components/leads/csv-importer";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportLeadsAdminPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [branches, productTypes, campaigns] = await Promise.all([
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/admin/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar leads desde CSV
        </h1>
        <p className="text-sm text-muted-foreground">
          Subí un archivo, revisá cada fila inline y confirmá. Los cambios se
          mantienen sólo hasta confirmar.
        </p>
      </header>

      <CsvImporter
        redirectTo="/admin/leads"
        branches={(branches.data ?? []).map((b) => ({
          id: b.id,
          label: b.name,
        }))}
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

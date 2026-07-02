import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { DownloadSampleCsv } from "@/components/download-sample-csv";
import { CsvImporter } from "@/components/leads/csv-importer";
import { Card } from "@/components/ui/card";
import { CSV_HEADERS } from "@/lib/leads";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const LEADS_CSV_EXAMPLES = [
  {
    first_name: "María",
    last_name: "Gómez",
    email: "maria.gomez@gmail.com",
    phone: "+541144112233",
    city: "Buenos Aires",
    vehicle_model: "Toyota Corolla",
    vehicle_version: "XEi 2.0",
    preferred_color: "Blanco",
    budget_min: "15000000",
    budget_max: "20000000",
    has_used_car: "true",
    used_car_description: "Fiat Cronos 2022 con 40.000km",
    declared_payment_method: "used_car",
    initial_notes: "Quiere entrega rápida, viene de Meta Ads.",
  },
  {
    first_name: "Juan",
    last_name: "Pérez",
    email: "juan.perez@hotmail.com",
    phone: "+5491155667788",
    city: "Rosario",
    vehicle_model: "Volkswagen Polo",
    vehicle_version: "Highline",
    preferred_color: "Gris",
    budget_min: "",
    budget_max: "12000000",
    has_used_car: "false",
    used_car_description: "",
    declared_payment_method: "financed",
    initial_notes: "Quiere financiación a 36 meses.",
  },
];

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Importar leads desde CSV
          </h1>
          <p className="text-sm text-muted-foreground">
            Subí un archivo, revisá cada fila inline y confirmá. Los cambios se
            mantienen sólo hasta confirmar.
          </p>
        </div>
        <DownloadSampleCsv
          headers={CSV_HEADERS}
          examples={LEADS_CSV_EXAMPLES}
          filename="ejemplo-leads.csv"
        />
      </header>

      <Link href="/admin/leads/import-ai">
        <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Nuevo: carga con IA
            </p>
            <p className="text-xs text-muted-foreground">
              Subí cualquier archivo (aunque las columnas no coincidan) y la IA
              las mapea sola. Ideal para exports de Meta, portales, etc.
            </p>
          </div>
        </Card>
      </Link>

      <Card className="flex flex-col gap-1 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">
          Columnas esperadas (en cualquier orden):
        </p>
        <p>{CSV_HEADERS.join(" · ")}</p>
        <p className="mt-1">
          <strong>declared_payment_method</strong> debe ser uno de:{" "}
          <code>cash</code>, <code>financed</code>, <code>savings_plan</code>,{" "}
          <code>used_car</code>, <code>other</code>. <strong>has_used_car</strong>:{" "}
          <code>true</code> / <code>false</code>.
        </p>
      </Card>

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

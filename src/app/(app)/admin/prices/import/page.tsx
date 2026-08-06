import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { DownloadSampleCsv } from "@/components/download-sample-csv";
import { PricesImporter } from "@/components/prices/prices-importer";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

const PRICES_CSV_HEADERS = [
  "brand",
  "model",
  "version",
  "year",
  "currency",
  "list_price",
  "product_type",
  "notes",
] as const;

const PRICES_CSV_EXAMPLES = [
  {
    brand: "Toyota",
    model: "Corolla",
    version: "XEi 2.0 CVT",
    year: "2026",
    currency: "ARS",
    list_price: "18500000",
    product_type: "0 KM",
    notes: "Precio sugerido marzo. Incluye patentamiento.",
  },
  {
    brand: "Volkswagen",
    model: "Polo",
    version: "Highline 1.6 MSI",
    year: "2025",
    currency: "ARS",
    list_price: "12300000",
    product_type: "0 KM",
    notes: "Stock disponible 3 colores.",
  },
];

export default async function AdminPricesImportPage() {
  await requireRole(["admin"]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href="/admin/prices"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a precios
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Importar precios desde CSV o Excel
          </h1>
          <p className="text-sm text-muted-foreground">
            Subí un Excel (.xlsx, .xls) o CSV y previsualizá los datos antes de
            confirmar.
          </p>
        </div>
        <DownloadSampleCsv
          headers={PRICES_CSV_HEADERS}
          examples={PRICES_CSV_EXAMPLES}
          filename="ejemplo-precios.csv"
        />
      </header>

      <Link href="/admin/prices/import-ai">
        <Card className="flex flex-row items-center gap-3 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Nuevo: carga con IA</p>
            <p className="text-xs text-muted-foreground">
              Subí cualquier archivo (aunque las columnas no coincidan) y la IA
              las mapea sola. Ideal para listas de precios de fábrica o mayoristas.
            </p>
          </div>
        </Card>
      </Link>

      <Card className="flex flex-col gap-1 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">
          Columnas esperadas (en cualquier orden):
        </p>
        <p>{PRICES_CSV_HEADERS.join(" · ")}</p>
        <p className="mt-1">
          <strong>currency</strong>: típicamente <code>ARS</code> o{" "}
          <code>USD</code>. <strong>product_type</strong>: el nombre debe coincidir
          con uno de los Tipos de producto activos (ej:{" "}
          <code>0 KM</code>, <code>Usados</code>).
        </p>
      </Card>

      <PricesImporter redirectTo="/admin/prices" />
    </div>
  );
}

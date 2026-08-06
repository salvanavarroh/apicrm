import { ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { AiPricesImporter } from "@/components/prices/ai-prices-importer";
import { requireRole } from "@/lib/auth";

export default async function AdminPricesImportAiPage() {
  await requireRole(["admin"]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/admin/prices"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a precios
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" /> Carga de precios con IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Subí cualquier CSV o Excel: la IA entiende las columnas, las mapea a la
          lista de precios y te deja revisar antes de confirmar.
        </p>
      </header>

      <AiPricesImporter redirectTo="/admin/prices" />
    </div>
  );
}

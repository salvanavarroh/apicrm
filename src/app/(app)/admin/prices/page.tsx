import { Plus, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { PriceDialog } from "./price-dialog";
import { PricesImportDialog } from "./prices-import-dialog";
import { RowActions } from "./row-actions";

export default async function AdminPricesPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: prices }, { data: productTypes }] = await Promise.all([
    supabase
      .from("prices")
      .select(
        `
          id,
          brand,
          model,
          version,
          model_year,
          currency,
          list_price,
          status,
          notes,
          product_types:product_type_id (id, name)
        `,
      )
      .eq("company_id", profile.company_id!)
      .order("brand", { ascending: true })
      .order("model", { ascending: true }),
    supabase
      .from("product_types")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
  ]);

  const rows = prices ?? [];
  const pts = (productTypes ?? []).map((p) => ({ id: p.id, label: p.name }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lista de precios
          </h1>
          <p className="text-sm text-muted-foreground">
            Lista referencial. Los Vendedores cargan precios manualmente al
            cotizar.
          </p>
        </div>
        <div className="flex gap-2">
          <PricesImportDialog
            productTypes={pts}
            trigger={
              <Button variant="outline">
                <Upload className="mr-2 size-4" /> Importar
              </Button>
            }
          />
          <PriceDialog
            productTypes={pts}
            trigger={
              <Button>
                <Plus className="mr-2 size-4" /> Nuevo
              </Button>
            }
          />
        </div>
      </header>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Marca</th>
              <th className="px-4 py-2 text-left">Modelo</th>
              <th className="px-4 py-2 text-left">Versión</th>
              <th className="px-4 py-2 text-left">Año</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-right">Precio</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Sin precios cargados todavía.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{p.brand}</td>
                <td className="px-4 py-3">{p.model}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.version ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.model_year ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.product_types?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {Number(p.list_price).toLocaleString("es-AR", {
                    style: "currency",
                    currency: p.currency || "ARS",
                    minimumFractionDigits: 0,
                  })}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={p.status === "active" ? "default" : "secondary"}
                  >
                    {p.status === "active" ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions
                    price={{
                      id: p.id,
                      brand: p.brand,
                      model: p.model,
                      version: p.version ?? "",
                      model_year: p.model_year ?? "",
                      currency: p.currency,
                      list_price: String(p.list_price),
                      notes: p.notes ?? "",
                      status: p.status as "active" | "inactive",
                      product_type_id: p.product_types?.id ?? "",
                    }}
                    productTypes={pts}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

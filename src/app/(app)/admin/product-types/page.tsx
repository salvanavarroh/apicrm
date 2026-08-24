import { Briefcase, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { ProductTypeDialog } from "./product-type-dialog";
import { ProductTypeRowActions } from "./product-type-row-actions";

export default async function ProductTypesPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();

  const [ptsRes, branchesRes, bptsRes] = await Promise.all([
    supabase
      .from("product_types")
      .select("id, name, status")
      .order("created_at", { ascending: false }),
    supabase
      .from("branches")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase.from("branch_product_types").select("branch_id, product_type_id"),
  ]);

  const branches = branchesRes.data ?? [];
  const bpts = bptsRes.data ?? [];

  const productTypes = (ptsRes.data ?? []).map((pt) => ({
    ...pt,
    branch_ids: bpts
      .filter((b) => b.product_type_id === pt.id)
      .map((b) => b.branch_id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Tipos de producto
          </h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            0km, usados, planes de ahorro… definí las categorías comerciales y
            en qué sucursales se ofrecen.
          </p>
        </div>
        <ProductTypeDialog
          branches={branches}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Nuevo tipo
            </Button>
          }
        />
      </header>

      {productTypes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Briefcase className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no cargaste tipos de producto.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="w-full overflow-x-auto">

            <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Sucursales habilitadas</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productTypes.map((pt) => {
                const branchNames = pt.branch_ids
                  .map((id) => branches.find((b) => b.id === id)?.name)
                  .filter(Boolean) as string[];
                return (
                  <tr key={pt.id} className="border-t border-border bg-card hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <Briefcase className="size-3.5 text-accent" />
                        {pt.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {branchNames.length ? branchNames.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          pt.status === "active"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {pt.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProductTypeRowActions
                        productType={pt}
                        branches={branches}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </Card>
      )}
    </div>
  );
}

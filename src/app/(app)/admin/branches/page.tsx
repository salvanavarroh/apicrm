import { Plus, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { BranchDialog } from "./branch-dialog";
import { BranchRowActions } from "./branch-row-actions";

export default async function BranchesPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("*")
    .order("created_at", { ascending: false });

  const list = branches ?? [];
  const activeCount = list.filter((b) => b.status === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Sucursales</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Gestioná las sucursales de tu concesionaria. {activeCount}{" "}
            {activeCount === 1 ? "activa" : "activas"} de {list.length}.
          </p>
        </div>
        <BranchDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Nueva sucursal
            </Button>
          }
        />
      </header>

      {list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Store className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no cargaste sucursales.
          </p>
          <BranchDialog
            trigger={
              <Button variant="outline" size="sm">
                Crear primera sucursal
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <Store className="size-3.5 text-accent" />
                      {b.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        b.status === "active"
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {b.status === "active" ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <BranchRowActions branch={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

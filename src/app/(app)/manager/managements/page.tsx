import { Settings2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { AutoToggle } from "./auto-toggle";

export default async function ManagementsPage() {
  const profile = await requireRole(["manager"]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("managements")
    .select(
      "id, auto_assignment_enabled, branch:branches!managements_branch_id_fkey(name), product_type:product_types!managements_product_type_id_fkey(name)",
    )
    .eq("manager_id", profile.id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    auto_assignment_enabled: boolean;
    branch: { name: string } | null;
    product_type: { name: string } | null;
  };
  const list = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Gerencias</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Activá la asignación automática para repartir leads nuevos entre tus
          vendedores activos por round-robin. Si está desactivada, los leads
          quedan en &quot;Sin asignar&quot; para que vos los asignes a mano.
        </p>
      </header>

      {list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Settings2 className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No tenés gerencias asignadas. Pedile al Admin que te asigne sucursales
            y tipos de producto.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Tipo de producto</th>
                <th className="px-4 py-3 font-medium">Asignación automática</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t border-border" >
                  <td className="px-4 py-3 font-medium">
                    {m.branch?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.product_type?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <AutoToggle
                      managementId={m.id}
                      enabled={m.auto_assignment_enabled}
                    />
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

import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import { ProviderPoolRow } from "./provider-pool-row";

export default async function DataProviderPoolPage() {
  const profile = await requireRole(["data_provider"]);
  const supabase = await createClient();

  const [{ data: leads }, branches, productTypes] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
          id,
          first_name,
          last_name,
          phone,
          email,
          vehicle_model,
          status,
          created_at,
          branch_id,
          product_type_id
        `,
      )
      .eq("created_by", profile.id)
      .or("branch_id.is.null,product_type_id.is.null")
      .order("created_at", { ascending: false }),
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
  ]);

  const rows = leads ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/data-provider"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver al inicio
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Mis cargas sin clasificar
          </h1>
          <p className="text-sm text-muted-foreground">
            Asigná sucursal y tipo de producto. Después se mueven al pipeline.
          </p>
        </div>
        <Button asChild>
          <Link href="/data-provider/leads/new">Nuevo lead</Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No tenés cargas pendientes.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Contacto</th>
                <th className="px-4 py-2 text-left">Vehículo</th>
                <th className="px-4 py-2 text-left">Cargado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {fullName(lead.first_name, lead.last_name)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{lead.phone ?? "—"}</div>
                    <div className="text-muted-foreground">
                      {lead.email ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.vehicle_model ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ProviderPoolRow
                      leadId={lead.id}
                      currentBranchId={lead.branch_id}
                      currentProductTypeId={lead.product_type_id}
                      branches={(branches.data ?? []).map((b) => ({
                        id: b.id,
                        label: b.name,
                      }))}
                      productTypes={(productTypes.data ?? []).map((p) => ({
                        id: p.id,
                        label: p.name,
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

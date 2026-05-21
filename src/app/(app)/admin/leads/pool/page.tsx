import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import { PoolRowActions } from "./pool-row-actions";

export default async function LeadsPoolAdminPage() {
  const profile = await requireRole(["admin"]);
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
          city,
          vehicle_model,
          created_at,
          created_by,
          branch_id,
          product_type_id,
          campaigns:campaign_id (name),
          created_by_user:profiles!created_by (first_name, last_name, role)
        `,
      )
      .eq("company_id", profile.company_id!)
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
        href="/admin/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pool sin clasificar
          </h1>
          <p className="text-sm text-muted-foreground">
            Leads sin sucursal o tipo de producto. Asigná para que entren al
            pipeline.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/leads/new">Nuevo lead</Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No hay leads en el pool. ¡Bien ahí!
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Contacto</th>
                <th className="px-4 py-2 text-left">Vehículo</th>
                <th className="px-4 py-2 text-left">Cargado por</th>
                <th className="px-4 py-2 text-left">Campaña</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="border-b bg-card last:border-0 hover:bg-muted/40">
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
                  <td className="px-4 py-3 text-xs">
                    {lead.created_by_user
                      ? `${fullName(
                          lead.created_by_user.first_name,
                          lead.created_by_user.last_name,
                        )}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {lead.campaigns?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PoolRowActions
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

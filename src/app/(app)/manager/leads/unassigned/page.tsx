import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { ReassignDialog } from "@/components/leads/reassign-dialog";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { getAssignableSalesUsers } from "@/lib/team";

export default async function UnassignedLeadsPage() {
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  // RLS se encarga de filtrar por las gerencias del manager.
  const [{ data: leads }, team] = await Promise.all([
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
          product_type_id,
          branches:branch_id (name),
          product_types:product_type_id (name)
        `,
      )
      .eq("company_id", profile.company_id!)
      .is("assigned_user_id", null)
      .not("branch_id", "is", null)
      .not("product_type_id", "is", null)
      .order("created_at", { ascending: false }),
    getAssignableSalesUsers({
      companyId: profile.company_id!,
      managerId: profile.id,
    }),
  ]);

  const rows = leads ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/manager/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Leads sin asignar
        </h1>
        <p className="text-sm text-muted-foreground">
          Asigná manualmente. Si la auto-asignación está activada en{" "}
          <Link
            href="/manager/managements"
            className="text-accent underline-offset-4 hover:underline"
          >
            Gerencias
          </Link>
          , los leads nuevos van directo a tu equipo.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No hay leads pendientes de asignación.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Vehículo</th>
                <th className="px-4 py-2 text-left">Sucursal</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Estado</th>
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
                    {lead.vehicle_model ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.branches?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.product_types?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ReassignDialog
                      leadId={lead.id}
                      leadProductTypeId={lead.product_type_id}
                      currentAssigneeId={null}
                      users={team}
                      trigger={
                        <Button size="sm" variant="outline">
                          Asignar
                        </Button>
                      }
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

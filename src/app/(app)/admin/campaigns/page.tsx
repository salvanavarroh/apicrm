import { Megaphone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CampaignDialog, ORIGIN_LABELS } from "./campaign-dialog";
import type { Origin } from "./campaign-dialog";
import { CampaignRowActions } from "./campaign-row-actions";

export default async function CampaignsPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const [campaignsRes, branchesRes, ptsRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("branches")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("product_types")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Campañas</h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Definí los orígenes desde donde llegan tus leads. Las campañas se
            seleccionan al cargar nuevos leads.
          </p>
        </div>
        <CampaignDialog
          branches={branches}
          productTypes={productTypes}
          trigger={
            <Button>
              <Plus className="mr-1 size-4" /> Nueva campaña
            </Button>
          }
        />
      </header>

      {campaigns.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Megaphone className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no cargaste campañas.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Campaña</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Tipo de producto</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const ptName = c.product_type_id
                  ? productTypes.find((p) => p.id === c.product_type_id)?.name
                  : null;
                const branchName = c.branch_id
                  ? branches.find((b) => b.id === c.branch_id)?.name
                  : null;
                return (
                  <tr key={c.id} className="border-t border-border" >
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <Megaphone className="size-3.5 text-accent" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ORIGIN_LABELS[c.origin as Origin]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ptName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {branchName ?? "Todas"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          c.status === "active"
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {c.status === "active" ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CampaignRowActions
                        campaign={{ ...c, origin: c.origin as Origin }}
                        branches={branches}
                        productTypes={productTypes}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

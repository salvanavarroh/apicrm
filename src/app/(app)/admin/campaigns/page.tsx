import { Megaphone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CampaignDialog } from "./campaign-dialog";
import type { Origin } from "./campaign-dialog";
import { CampaignsTable, type CampaignRow } from "./campaigns-table";

export default async function CampaignsPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const [campaignsRes, branchesRes, ptsRes, cbRes] = await Promise.all([
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
    supabase.from("campaign_branches").select("campaign_id, branch_id"),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const branches = branchesRes.data ?? [];
  const productTypes = ptsRes.data ?? [];

  // Sucursales por campaña (para el reparto multi-sucursal round-robin).
  const branchIdsByCampaign = new Map<string, string[]>();
  for (const cb of cbRes.data ?? []) {
    const arr = branchIdsByCampaign.get(cb.campaign_id) ?? [];
    arr.push(cb.branch_id);
    branchIdsByCampaign.set(cb.campaign_id, arr);
  }
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? null;

  // Orígenes "Otros" ya cargados (distintos) → reutilizables en el diálogo.
  const customOrigins = Array.from(
    new Set(
      campaigns
        .filter((c) => c.origin === "other" && c.origin_other)
        .map((c) => c.origin_other!.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const rows: CampaignRow[] = campaigns.map((c) => {
    const bIds = branchIdsByCampaign.get(c.id) ?? (c.branch_id ? [c.branch_id] : []);
    return {
      id: c.id,
      name: c.name,
      origin: c.origin as Origin,
      origin_other: c.origin_other,
      product_type_id: c.product_type_id,
      branch_id: c.branch_id,
      branch_ids: bIds,
      status: c.status as "active" | "inactive",
      ptName: c.product_type_id
        ? (productTypes.find((p) => p.id === c.product_type_id)?.name ?? null)
        : null,
      branchNames: bIds.map(branchName).filter(Boolean) as string[],
    };
  });

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
          customOrigins={customOrigins}
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
        <CampaignsTable
          rows={rows}
          branches={branches}
          productTypes={productTypes}
          customOrigins={customOrigins}
        />
      )}
    </div>
  );
}

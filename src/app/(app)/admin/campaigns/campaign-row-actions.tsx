"use client";

import { PencilLine, Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteCampaign, toggleCampaignStatus } from "./actions";
import { CampaignDialog } from "./campaign-dialog";
import type { Origin } from "./campaign-dialog";

type Campaign = {
  id: string;
  name: string;
  origin: Origin;
  origin_other: string | null;
  product_type_id: string | null;
  branch_id: string | null;
  status: "active" | "inactive";
};

export function CampaignRowActions({
  campaign,
  branches,
  productTypes,
  customOrigins = [],
}: {
  campaign: Campaign;
  branches: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
  customOrigins?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = campaign.status === "active" ? "inactive" : "active";
      const result = await toggleCampaignStatus(campaign.id, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        next === "active" ? "Campaña activada" : "Campaña desactivada",
      );
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar campaña "${campaign.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteCampaign(campaign.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Campaña eliminada");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <CampaignDialog
        branches={branches}
        productTypes={productTypes}
        campaign={campaign}
        customOrigins={customOrigins}
        trigger={
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Editar"
          >
            <PencilLine className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={campaign.status === "active" ? "Desactivar" : "Activar"}
        onClick={toggle}
        disabled={pending}
      >
        {campaign.status === "active" ? (
          <PowerOff className="size-3.5" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-destructive"
        aria-label="Eliminar"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

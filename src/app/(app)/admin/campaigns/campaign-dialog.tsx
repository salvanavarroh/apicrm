"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { upsertCampaign } from "./actions";

type Origin =
  | "meta_ads"
  | "google_ads"
  | "whatsapp"
  | "showroom"
  | "referral"
  | "web"
  | "email"
  | "instagram"
  | "tiktok_ads"
  | "marketplace"
  | "portal_usados"
  | "inbound_call"
  | "other";

type Campaign = {
  id: string;
  name: string;
  origin: Origin;
  origin_other: string | null;
  product_type_id: string | null;
  branch_id: string | null;
  status: "active" | "inactive";
};

const ORIGIN_LABELS: Record<Origin, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  showroom: "Mostrador",
  referral: "Referido",
  web: "Web",
  email: "Email",
  instagram: "Instagram",
  tiktok_ads: "TikTok Ads",
  marketplace: "Marketplace",
  portal_usados: "Portal de usados",
  inbound_call: "Llamada entrante",
  other: "Otros",
};
const ORIGINS: Origin[] = [
  "meta_ads",
  "google_ads",
  "whatsapp",
  "instagram",
  "tiktok_ads",
  "marketplace",
  "portal_usados",
  "showroom",
  "inbound_call",
  "referral",
  "web",
  "email",
  "other",
];
const NONE = "__none__";

export function CampaignDialog({
  trigger,
  branches,
  productTypes,
  campaign,
  customOrigins = [],
}: {
  trigger: ReactNode;
  customOrigins?: string[];
  branches: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
  campaign?: Campaign;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaign?.name ?? "");
  const [origin, setOrigin] = useState<Origin>(
    campaign?.origin ?? "meta_ads",
  );
  const [originOther, setOriginOther] = useState(campaign?.origin_other ?? "");
  const [productTypeId, setProductTypeId] = useState<string>(
    campaign?.product_type_id ?? NONE,
  );
  const [branchId, setBranchId] = useState<string>(
    campaign?.branch_id ?? NONE,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(campaign?.name ?? "");
      setOrigin(campaign?.origin ?? "meta_ads");
      setOriginOther(campaign?.origin_other ?? "");
      setProductTypeId(campaign?.product_type_id ?? NONE);
      setBranchId(campaign?.branch_id ?? NONE);
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    if (origin === "other" && !originOther.trim()) {
      setError("Escribí el origen cuando elegís “Otros”.");
      return;
    }
    startTransition(async () => {
      const result = await upsertCampaign({
        id: campaign?.id,
        name,
        origin,
        origin_other: origin === "other" ? originOther.trim() : "",
        product_type_id: productTypeId === NONE ? "" : productTypeId,
        branch_id: branchId === NONE ? "" : branchId,
        status: campaign?.status ?? "active",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(campaign ? "Campaña actualizada" : "Campaña creada");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Editar campaña" : "Nueva campaña"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-name">Nombre</Label>
            <Input
              id="cmp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Meta Ads Marzo 2026"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Origen general</Label>
            <Select
              value={origin}
              onValueChange={(v) => setOrigin(v as Origin)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGINS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {ORIGIN_LABELS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {origin === "other" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-origin-other">Especificá el origen</Label>
              <Input
                id="cmp-origin-other"
                value={originOther}
                onChange={(e) => setOriginOther(e.target.value)}
                placeholder="ej: Feria, Radio, Volante…"
                list="cmp-origin-other-options"
                required
              />
              {/* Orígenes "Otros" ya usados → reutilizables (elegibles). */}
              <datalist id="cmp-origin-other-options">
                {customOrigins.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Tipo de producto (opcional)</Label>
            <Select value={productTypeId} onValueChange={setProductTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin tipo específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin tipo específico</SelectItem>
                {productTypes.map((pt) => (
                  <SelectItem key={pt.id} value={pt.id}>
                    {pt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Sucursal (opcional)</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas las sucursales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Todas las sucursales</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ORIGIN_LABELS, ORIGINS };
export type { Origin };

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteLeadAdForm, upsertLeadAdForm } from "@/app/(app)/admin/lead-ads/actions";

type Opt = { id: string; name: string };
export type LeadAdFormRow = {
  id: string;
  meta_form_id: string;
  form_name: string | null;
  branch_id: string | null;
  product_type_id: string | null;
  campaign_id: string | null;
};

export function LeadAdsManager({
  forms,
  branches,
  productTypes,
  campaigns,
}: {
  forms: LeadAdFormRow[];
  branches: Opt[];
  productTypes: Opt[];
  campaigns: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [metaFormId, setMetaFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [campaignId, setCampaignId] = useState("");

  const nameOf = (opts: Opt[], id: string | null) =>
    opts.find((o) => o.id === id)?.name ?? "—";

  function add() {
    if (!metaFormId.trim()) {
      toast.error("Pegá el ID del formulario de Meta");
      return;
    }
    start(async () => {
      const res = await upsertLeadAdForm({
        metaFormId,
        formName,
        branchId,
        productTypeId,
        campaignId,
      });
      if (res.ok) {
        toast.success("Mapeo guardado");
        setMetaFormId("");
        setFormName("");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteLeadAdForm(id);
      if (res.ok) router.refresh();
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="grid gap-2 p-4 sm:grid-cols-2">
        <input
          value={metaFormId}
          onChange={(e) => setMetaFormId(e.target.value)}
          placeholder="ID del formulario de Meta (formId)"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-md border px-2 py-2 text-sm">
          <option value="">Sucursal…</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={productTypeId} onChange={(e) => setProductTypeId(e.target.value)} className="rounded-md border px-2 py-2 text-sm">
          <option value="">Tipo de producto…</option>
          {productTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="rounded-md border px-2 py-2 text-sm">
          <option value="">Campaña (opcional)…</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div>
          <Button onClick={add} disabled={pending}>Guardar mapeo</Button>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Con sucursal + tipo, los leads se auto-asignan por round-robin. Sin
          mapear, caen al pool sin clasificar.
        </p>
      </Card>

      <div className="space-y-2">
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay formularios mapeados.</p>
        ) : (
          forms.map((f) => (
            <Card key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{f.form_name ?? f.meta_form_id}</div>
                <div className="text-xs text-muted-foreground">
                  {f.meta_form_id} · {nameOf(branches, f.branch_id)} /{" "}
                  {nameOf(productTypes, f.product_type_id)}
                  {f.campaign_id ? ` · ${nameOf(campaigns, f.campaign_id)}` : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => remove(f.id)} disabled={pending}>
                Borrar
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

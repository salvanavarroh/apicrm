"use client";

import { Check, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  deleteLeadAdForm,
  pullLeadForms,
  upsertLeadAdForm,
  type PulledForm,
} from "@/app/(app)/admin/lead-ads/actions";

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
  const [pulled, setPulled] = useState<PulledForm[] | null>(null);
  const [pullSearch, setPullSearch] = useState("");
  const mappingRef = useRef<HTMLDivElement>(null);

  const nameOf = (opts: Opt[], id: string | null) =>
    opts.find((o) => o.id === id)?.name ?? "—";
  const mappedIds = new Set(forms.map((f) => f.meta_form_id));

  const filteredPulled = useMemo(() => {
    if (!pulled) return [];
    const q = pullSearch.trim().toLowerCase();
    if (!q) return pulled;
    return pulled.filter((f) => `${f.name} ${f.id}`.toLowerCase().includes(q));
  }, [pulled, pullSearch]);

  function pull() {
    start(async () => {
      const res = await pullLeadForms();
      if (res.ok) {
        setPulled(res.forms);
        if (res.forms.length === 0)
          toast.info("La cuenta no tiene formularios de Lead Ads");
      } else {
        toast.error(res.message);
      }
    });
  }

  function use(f: PulledForm) {
    setMetaFormId(f.id);
    setFormName(f.name);
    mappingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast.info("Completá sucursal/tipo y guardá el mapeo");
  }

  function add() {
    if (!metaFormId.trim()) {
      toast.error("Elegí un formulario de la lista o pegá su ID");
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
        setBranchId("");
        setProductTypeId("");
        setCampaignId("");
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

  const selectCls =
    "rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="space-y-6">
      {/* Formularios de Facebook — tabla scrolleable */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Formularios en tu Página de Facebook</p>
            <p className="text-xs text-muted-foreground">
              Traé tus Lead Ads y mapealos al routing del CRM.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={pull} disabled={pending}>
            <RefreshCw className={cn("mr-1 size-4", pending && "animate-spin")} />
            Traer de Facebook
          </Button>
        </div>

        {pulled === null ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Necesitás una Página de Facebook conectada (Meta Ads → Conexión). Tocá
            “Traer de Facebook” para listar tus formularios.
          </p>
        ) : pulled.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            La cuenta no tiene formularios de Lead Ads.
          </p>
        ) : (
          <>
            {pulled.length > 8 && (
              <div className="relative border-b px-4 py-2">
                <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={pullSearch}
                  onChange={(e) => setPullSearch(e.target.value)}
                  placeholder="Buscar formulario…"
                  className="w-full rounded-md border bg-background py-1.5 pl-9 pr-3 text-sm"
                />
              </div>
            )}
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Formulario</th>
                    <th className="px-4 py-2 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPulled.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin resultados para “{pullSearch}”.
                      </td>
                    </tr>
                  ) : (
                    filteredPulled.map((f) => {
                      const already = mappedIds.has(f.id);
                      return (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2">
                            <div className="truncate font-medium">{f.name}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {f.id}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {already ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <Check className="size-3.5" /> Mapeado
                              </span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => use(f)}>
                                Usar
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              {filteredPulled.length}
              {pullSearch ? ` de ${pulled.length}` : ""} formulario
              {pulled.length === 1 ? "" : "s"}
            </div>
          </>
        )}
      </Card>

      {/* Mapeo */}
      <div ref={mappingRef}>
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">
              {metaFormId ? "Mapear formulario seleccionado" : "Mapear un formulario"}
            </p>
            <p className="text-xs text-muted-foreground">
              Con sucursal + tipo, los leads se auto-asignan por round-robin. Sin
              mapear, caen al pool sin clasificar.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={metaFormId}
              onChange={(e) => setMetaFormId(e.target.value)}
              placeholder="ID del formulario de Meta"
              className="rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nombre (opcional)"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
              <option value="">Sucursal…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select value={productTypeId} onChange={(e) => setProductTypeId(e.target.value)} className={selectCls}>
              <option value="">Tipo de producto…</option>
              {productTypes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectCls}>
              <option value="">Campaña (opcional)…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex items-center">
              <Button onClick={add} disabled={pending}>Guardar mapeo</Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Mapeados */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          Formularios mapeados{" "}
          <span className="font-normal text-muted-foreground">({forms.length})</span>
        </h3>
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no mapeaste ningún formulario.
          </p>
        ) : (
          forms.map((f) => (
            <Card key={f.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {f.form_name ?? f.meta_form_id}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{f.meta_form_id}</span> ·{" "}
                    {nameOf(branches, f.branch_id)} / {nameOf(productTypes, f.product_type_id)}
                    {f.campaign_id ? ` · ${nameOf(campaigns, f.campaign_id)}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => remove(f.id)} disabled={pending}>
                  Borrar
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

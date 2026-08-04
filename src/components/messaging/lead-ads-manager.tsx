"use client";

import { Check, Download, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  createCampaignFromForm,
  deleteLeadAdForm,
  getFormLeads,
  pullLeadForms,
  startFormImport,
  upsertLeadAdForm,
  type FormImportJob,
  type FormLeadRow,
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
  const [detail, setDetail] = useState<LeadAdFormRow | null>(null);
  const [localCampaigns, setLocalCampaigns] = useState(campaigns);
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

  function createCampaign() {
    const name = (formName || metaFormId).trim();
    if (!name) {
      toast.error("Elegí un formulario primero");
      return;
    }
    start(async () => {
      const res = await createCampaignFromForm({ name, branchId, productTypeId });
      if (res.ok) {
        setLocalCampaigns((p) => [{ id: res.campaignId, name: res.name }, ...p]);
        setCampaignId(res.campaignId);
        toast.success(`Campaña “${res.name}” creada y asignada`);
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
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className={cn(selectCls, "min-w-0 flex-1")}
              >
                <option value="">Campaña (opcional)…</option>
                {localCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={createCampaign}
                disabled={!metaFormId || pending}
                title="Crear una campaña nueva con el nombre del formulario"
              >
                <Plus className="mr-1 size-4" /> Crear campaña del form
              </Button>
            </div>
            <div className="flex items-center sm:col-span-2">
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
                <button
                  type="button"
                  onClick={() => setDetail(f)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium hover:underline">
                    {f.form_name ?? f.meta_form_id}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{f.meta_form_id}</span> ·{" "}
                    {nameOf(branches, f.branch_id)} / {nameOf(productTypes, f.product_type_id)}
                    {f.campaign_id ? ` · ${nameOf(localCampaigns, f.campaign_id)}` : ""}
                  </div>
                </button>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setDetail(f)}>
                    Ver leads
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(f.id)} disabled={pending}>
                    Borrar
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {detail && <FormLeadsDrawer form={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// Detalle de un formulario mapeado: importar leads históricos (backend, reanudable)
// + ver los leads ya ingresados (histórico + los que entran por webhook).
function FormLeadsDrawer({
  form,
  onClose,
}: {
  form: LeadAdFormRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<{
    leads: FormLeadRow[];
    total: number;
    job: FormImportJob;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const res = await getFormLeads(form.meta_form_id);
    if (res.ok) setData({ leads: res.leads, total: res.total, job: res.job });
  }
  useEffect(() => {
    let alive = true;
    getFormLeads(form.meta_form_id).then((res) => {
      if (alive && res.ok) setData({ leads: res.leads, total: res.total, job: res.job });
    });
    return () => {
      alive = false;
    };
  }, [form.meta_form_id]);

  async function runImport() {
    setImporting(true);
    try {
      const res = await startFormImport(form.meta_form_id);
      if (!res.ok) {
        toast.error(res.message);
      } else if (res.status === "done") {
        toast.success(`Import terminado: ${res.imported} nuevos, ${res.duplicates} ya existían`);
      } else {
        toast.info(
          `Importados ${res.imported} hasta ahora. Faltan más — tocá "Continuar".`,
        );
      }
      await load();
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  const job = data?.job;
  const paused = job?.status === "paused" || job?.status === "error";
  const running = importing || job?.status === "running";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="truncate font-semibold">{form.form_name ?? form.meta_form_id}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {form.meta_form_id}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Import histórico */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Importar leads históricos</p>
              <p className="text-xs text-muted-foreground">
                Trae los leads ya enviados a este formulario. Corre en el backend y
                te avisa al terminar.
              </p>
            </div>
            <Button size="sm" onClick={runImport} disabled={running}>
              <Download className={cn("mr-1 size-4", importing && "animate-pulse")} />
              {paused ? "Continuar" : importing ? "Importando…" : "Importar"}
            </Button>
          </div>
          {job && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  job.status === "done"
                    ? "bg-emerald-100 text-emerald-700"
                    : job.status === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700",
                )}
              >
                {job.status === "done"
                  ? "Completado"
                  : job.status === "paused"
                    ? "Pausado (tocá Continuar)"
                    : job.status === "error"
                      ? "Con error"
                      : "En curso"}
              </span>
              <span className="text-muted-foreground">
                {job.imported} importados
                {job.duplicates ? ` · ${job.duplicates} ya existían` : ""}
              </span>
              {job.error && <span className="text-red-600">{job.error}</span>}
            </div>
          )}
        </div>

        {/* Leads del formulario */}
        <div className="flex-1 p-4">
          <p className="mb-2 text-sm font-medium">
            Leads de este formulario{" "}
            <span className="font-normal text-muted-foreground">
              ({data?.total ?? "…"})
            </span>
          </p>
          {!data ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : data.leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no ingresó ningún lead. Importá los históricos o esperá a que
              entren nuevos.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/admin/leads/${l.id}`}
                  className="rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {[l.first_name, l.last_name].filter(Boolean).join(" ") || "Sin nombre"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.phone ?? l.email ?? "—"}
                  </div>
                </Link>
              ))}
              {data.total > data.leads.length && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Mostrando {data.leads.length} de {data.total}. Vé el resto en Leads.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

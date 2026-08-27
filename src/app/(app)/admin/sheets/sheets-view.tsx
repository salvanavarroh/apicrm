"use client";

import {
  AlertTriangle,
  Check,
  Info,
  Plus,
  RefreshCw,
  Sheet,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FIELD_LABELS, MAPPABLE_FIELDS } from "@/lib/sheets/sync";
import { cn } from "@/lib/utils";

import {
  deleteSheetSource,
  inspectSheet,
  saveSheetSource,
  syncNow,
  type SheetSourceRow,
} from "./actions";

type Option = { id: string; label: string };

const NONE = "__none__";

/** Saca el ID y el gid de una URL de Google Sheets pegada tal cual. */
function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return null;
  const gid = url.match(/[#&?]gid=([0-9]+)/)?.[1] ?? "0";
  return { id, gid };
}

export function SheetsView({
  sources,
  branches,
  productTypes,
  campaigns,
}: {
  sources: SheetSourceRow[];
  branches: Option[];
  productTypes: Option[];
  campaigns: Option[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* La acción principal va en la cabecera, alineada a la derecha del título,
          como en Campañas, Tipos de producto y Usuarios. Antes estaba suelta al
          FINAL de la lista: con dos o tres planillas cargadas había que scrollear
          hasta abajo para encontrar el botón de agregar otra. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sheet className="size-6 text-accent" /> Leads desde Google Sheets
          </h1>
          <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
            Para las plataformas que escriben en una planilla en vez de darnos una
            API — el caso típico es TikTok Lead Gen. Revisamos la hoja cada tantos
            minutos y creamos los leads nuevos.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="mr-2 size-4" /> Conectar una planilla
        </Button>
      </header>

      <Card className="gap-2 border-accent/30 bg-accent/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-accent" />
          Cómo funciona
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>
            En la planilla: <strong>Compartir → Cualquier persona con el enlace
            → Lector</strong>. Sin eso no la podemos leer.
          </li>
          <li>Pegá la URL de la planilla acá y detectamos las columnas solas.</li>
          <li>
            Revisá el mapeo y activala. Cada 15 minutos (configurable) traemos las
            filas nuevas y creamos los leads.
          </li>
        </ol>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Usá una planilla que tenga <strong>sólo</strong> el feed de leads: al
          compartirla por enlace, cualquiera con la URL puede verla.
        </p>
      </Card>

      {sources.map((s) => (
        <SourceCard
          key={s.id}
          source={s}
          branches={branches}
          productTypes={productTypes}
          campaigns={campaigns}
        />
      ))}

      {creating && (
        <SourceForm
          branches={branches}
          productTypes={productTypes}
          campaigns={campaigns}
          onDone={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function SourceCard({
  source,
  branches,
  productTypes,
  campaigns,
}: {
  source: SheetSourceRow;
  branches: Option[];
  productTypes: Option[];
  campaigns: Option[];
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SourceForm
        existing={source}
        branches={branches}
        productTypes={productTypes}
        campaigns={campaigns}
        onDone={() => setEditing(false)}
      />
    );
  }

  const mapped = Object.keys(source.column_map ?? {}).length;

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              source.active
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Sheet className="size-4" />
          </span>
          <div>
            <p className="font-semibold">{source.name}</p>
            <p className="text-xs text-muted-foreground">
              {source.active
                ? `Activa · cada ${source.poll_minutes} min · ${mapped} columna(s) mapeada(s)`
                : `Pausada · ${mapped} columna(s) mapeada(s)`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {source.total_imported} lead(s) importados en total
              {source.last_synced_at
                ? ` · última corrida ${new Date(source.last_synced_at).toLocaleString("es-AR")}`
                : " · nunca se sincronizó"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await syncNow(source.id);
                if (!r.ok) toast.error(r.message);
                else toast.success(r.message || "Sin filas nuevas");
              })
            }
          >
            <RefreshCw className={cn("mr-2 size-3.5", pending && "animate-spin")} />
            Sincronizar ahora
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteSheetSource(source.id);
                if (!r.ok) toast.error(r.message);
                else toast.success("Fuente eliminada");
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {source.last_error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {source.last_error}
        </p>
      )}
      {!source.last_error && source.last_result && (
        <p className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
          Última corrida: {source.last_result}
        </p>
      )}
    </Card>
  );
}

function SourceForm({
  existing,
  branches,
  productTypes,
  campaigns,
  onDone,
}: {
  existing?: SheetSourceRow;
  branches: Option[];
  productTypes: Option[];
  campaigns: Option[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(existing?.name ?? "");
  const [url, setUrl] = useState(
    existing
      ? `https://docs.google.com/spreadsheets/d/${existing.spreadsheet_id}/edit#gid=${existing.gid}`
      : "",
  );
  const [ids, setIds] = useState<{ id: string; gid: string } | null>(
    existing ? { id: existing.spreadsheet_id, gid: existing.gid } : null,
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>(
    existing?.column_map ?? {},
  );
  const [branchId, setBranchId] = useState(existing?.branch_id ?? NONE);
  const [productTypeId, setProductTypeId] = useState(
    existing?.product_type_id ?? NONE,
  );
  const [campaignId, setCampaignId] = useState(existing?.campaign_id ?? NONE);
  const [active, setActive] = useState(existing?.active ?? false);
  const [poll, setPoll] = useState(existing?.poll_minutes ?? 15);
  const [inspectMsg, setInspectMsg] = useState("");

  function detect() {
    const parsed = parseSheetUrl(url);
    if (!parsed) {
      toast.error("No pude leer el ID en esa URL");
      return;
    }
    setIds(parsed);
    start(async () => {
      const res = await inspectSheet({
        spreadsheetId: parsed.id,
        gid: parsed.gid,
      });
      setInspectMsg(res.message);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setHeaders(res.headers);
      // Sólo se propone el mapeo si todavía no había uno hecho a mano.
      if (Object.keys(map).length === 0) setMap(res.suggested);
      toast.success(`Detecté ${res.headers.length} columnas`);
    });
  }

  const canSave =
    name.trim() && ids && (map.phone || map.email) && !pending;

  return (
    <Card className="gap-4 p-5">
      <p className="text-sm font-semibold">
        {existing ? "Editar planilla" : "Conectar una planilla"}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="TikTok — Campaña Hilux"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">Cada cuánto revisar</Label>
          <Select value={String(poll)} onValueChange={(v) => setPoll(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 30, 60, 180, 1440].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m < 60 ? `${m} minutos` : m === 1440 ? "1 vez por día" : `${m / 60} h`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold">URL de la planilla</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="min-w-[260px] flex-1"
          />
          <Button variant="outline" onClick={detect} disabled={pending || !url}>
            Detectar columnas
          </Button>
        </div>
        {inspectMsg && (
          <p className="text-[11px] text-muted-foreground">{inspectMsg}</p>
        )}
      </div>

      {(headers.length > 0 || Object.keys(map).length > 0) && (
        <>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold">
              Mapeo de columnas — al menos Teléfono o Email
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MAPPABLE_FIELDS.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {FIELD_LABELS[f]}
                    {(f === "phone" || f === "email") && (
                      <span className="text-accent"> *</span>
                    )}
                  </span>
                  <Select
                    value={map[f] ?? NONE}
                    onValueChange={(v) =>
                      setMap((prev) => {
                        const next = { ...prev };
                        if (v === NONE) delete next[f];
                        else next[f] = v;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="— sin mapear —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— sin mapear —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                      {/* Si se está editando sin re-detectar, se preserva lo ya
                          mapeado aunque no tengamos los encabezados cargados. */}
                      {map[f] && !headers.includes(map[f]) && (
                        <SelectItem value={map[f]}>{map[f]}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="h-px bg-border" />
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold">
          Con qué datos entran los leads
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <PickOne
            label="Sucursal"
            value={branchId}
            onChange={setBranchId}
            options={branches}
          />
          <PickOne
            label="Tipo de producto"
            value={productTypeId}
            onChange={setProductTypeId}
            options={productTypes}
          />
          <PickOne
            label="Campaña"
            value={campaignId}
            onChange={setCampaignId}
            options={campaigns}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Si dejás sucursal o tipo sin elegir, los leads caen en “Sin clasificar”
          y no se auto-asignan.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={active} onCheckedChange={setActive} />
          <span className="font-semibold">
            {active ? "Activa — se sincroniza sola" : "Pausada"}
          </span>
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() =>
              start(async () => {
                const r = await saveSheetSource({
                  id: existing?.id,
                  name,
                  spreadsheetId: ids!.id,
                  gid: ids!.gid,
                  columnMap: map,
                  branchId: branchId === NONE ? null : branchId,
                  productTypeId:
                    productTypeId === NONE ? null : productTypeId,
                  campaignId: campaignId === NONE ? null : campaignId,
                  active,
                  pollMinutes: poll,
                });
                if (!r.ok) toast.error(r.message);
                else {
                  toast.success("Planilla guardada");
                  onDone();
                }
              })
            }
          >
            Guardar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PickOne({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAPPED_STATUS_META,
  TARGET_FIELDS,
  TARGET_LABELS,
  type ColumnMapping,
  type LeadMapping,
  type MappedRow,
  type MappedRowStatus,
} from "@/lib/lead-import";
import type { ImportFileType } from "@/lib/lead-import-parse";
import {
  analyzeImport,
  commitImport,
  reapplyMapping,
  regenerateMapping,
  type AnalyzeResult,
  type ImportContext,
} from "@/lib/lead-ai-import-actions";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; label: string };

type Props = {
  companyId: string;
  branches: Option[];
  productTypes: Option[];
  campaigns: Option[];
  vendors: Option[];
  redirectTo: string;
  // El proveedor no clasifica (todo va al pool): ocultamos sucursal/tipo.
  showClassification?: boolean;
  // El proveedor tampoco distribuye: todo queda sin asignar.
  showDistribution?: boolean;
};

type Step = "setup" | "analyzing" | "review";

const TARGET_OPTIONS = [
  { value: "full_name", label: TARGET_LABELS.full_name },
  { value: "metadata", label: TARGET_LABELS.metadata },
  { value: "ignore", label: TARGET_LABELS.ignore },
  ...TARGET_FIELDS.map((f) => ({
    value: f.key,
    label: `${f.group} · ${f.label}`,
  })),
];

const STATUS_CLASSES: Record<MappedRowStatus, string> = {
  ok: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  duplicate: "bg-muted text-muted-foreground",
};

function fileTypeFromName(name: string): ImportFileType | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "excel";
  return null;
}

export function AiLeadImporter({
  companyId,
  branches,
  productTypes,
  campaigns,
  vendors,
  redirectTo,
  showClassification = true,
  showDistribution = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [committing, setCommitting] = useState(false);

  const [step, setStep] = useState<Step>("setup");
  const [file, setFile] = useState<File | null>(null);

  const [context, setContext] = useState<ImportContext>({
    branch_id: "",
    product_type_id: "",
    campaign_id: "",
    source: "",
    distribution: "unassigned",
    assignee_id: "",
  });

  const [filePath, setFilePath] = useState<string>("");
  const [fileType, setFileType] = useState<ImportFileType>("csv");
  const [mapping, setMapping] = useState<LeadMapping | null>(null);
  const [result, setResult] = useState<{
    stats: { total: number; ok: number; warning: number; error: number; duplicate: number };
    preview: MappedRow[];
  } | null>(null);
  const [instruction, setInstruction] = useState("");

  function applyAnalyze(res: AnalyzeResult) {
    if (!res.ok) {
      toast.error(res.message);
      setStep(mapping ? "review" : "setup");
      return;
    }
    setMapping(res.mapping);
    setResult({ stats: res.stats, preview: res.preview });
    setStep("review");
  }

  async function handleAnalyze() {
    if (!file) {
      toast.error("Elegí un archivo primero");
      return;
    }
    const ft = fileTypeFromName(file.name);
    if (!ft) {
      toast.error("Formato no soportado (usá CSV o Excel)");
      return;
    }
    setStep("analyzing");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()!.toLowerCase();
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("lead-imports")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error(`No pude subir el archivo: ${error.message}`);
        setStep("setup");
        return;
      }
      setFilePath(path);
      setFileType(ft);
      startTransition(async () => {
        const res = await analyzeImport(path, ft);
        applyAnalyze(res);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo el archivo");
      setStep("setup");
    }
  }

  function handleRegenerate() {
    if (!instruction.trim()) {
      toast.error("Escribí una instrucción para regenerar");
      return;
    }
    startTransition(async () => {
      const res = await regenerateMapping(filePath, fileType, instruction);
      if (res.ok) toast.success("Mapeo regenerado");
      applyAnalyze(res);
    });
  }

  function updateColumnTarget(source: string, target: string) {
    if (!mapping) return;
    const next: LeadMapping = {
      ...mapping,
      columns: mapping.columns.map((c): ColumnMapping =>
        c.source === source ? { ...c, target, confidence: 1, note: "Editado a mano" } : c,
      ),
    };
    setMapping(next);
    startTransition(async () => {
      const res = await reapplyMapping(filePath, fileType, next);
      if (res.ok) setResult({ stats: res.stats, preview: res.preview });
      else toast.error(res.message);
    });
  }

  function handleCommit() {
    if (!mapping) return;
    if (context.distribution === "fixed" && !context.assignee_id) {
      toast.error("Elegí el vendedor para la asignación fija");
      return;
    }
    setCommitting(true);
    startTransition(async () => {
      const res = await commitImport(filePath, fileType, mapping, context);
      setCommitting(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const parts = [`${res.inserted} lead(s) importados`];
      if (res.skippedDuplicates) parts.push(`${res.skippedDuplicates} duplicado(s)`);
      if (res.skippedErrors) parts.push(`${res.skippedErrors} con error`);
      toast.success(parts.join(" · "));
      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 1000);
    });
  }

  // --------------------------------------------------------------------------
  // Paso 1: pre-preguntas + archivo
  // --------------------------------------------------------------------------
  if (step === "setup" || step === "analyzing") {
    const analyzing = step === "analyzing";
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-4">
          <p className="text-sm font-medium">
            1. Contexto del archivo (se aplica a todos los leads)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {showClassification && (
              <>
                <Field label="Sucursal">
                  <PickSelect
                    value={context.branch_id ?? ""}
                    onChange={(v) => setContext((c) => ({ ...c, branch_id: v }))}
                    options={branches}
                    placeholder="— Pool"
                  />
                </Field>
                <Field label="Tipo de producto">
                  <PickSelect
                    value={context.product_type_id ?? ""}
                    onChange={(v) =>
                      setContext((c) => ({ ...c, product_type_id: v }))
                    }
                    options={productTypes}
                    placeholder="— Pool"
                  />
                </Field>
              </>
            )}
            <Field label="Campaña">
              <PickSelect
                value={context.campaign_id ?? ""}
                onChange={(v) => setContext((c) => ({ ...c, campaign_id: v }))}
                options={campaigns}
                placeholder="—"
              />
            </Field>
            <Field label="Origen (etiqueta legible)">
              <Input
                value={context.source ?? ""}
                onChange={(e) =>
                  setContext((c) => ({ ...c, source: e.target.value }))
                }
                placeholder="Ej: Meta Lead Ads"
              />
            </Field>
            {showDistribution && (
              <Field label="Distribución">
                <Select
                  value={context.distribution}
                  onValueChange={(v) =>
                    setContext((c) => ({
                      ...c,
                      distribution: v as ImportContext["distribution"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      Dejar sin asignar
                    </SelectItem>
                    <SelectItem value="round_robin">
                      Round-robin (por gerencia)
                    </SelectItem>
                    <SelectItem value="fixed">Vendedor fijo</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            {showDistribution && context.distribution === "fixed" && (
              <Field label="Vendedor">
                <PickSelect
                  value={context.assignee_id ?? ""}
                  onChange={(v) =>
                    setContext((c) => ({ ...c, assignee_id: v }))
                  }
                  options={vendors}
                  placeholder="Elegí un vendedor"
                />
              </Field>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 border-dashed p-6">
          <div className="flex items-center gap-3">
            <Upload className="size-4 text-muted-foreground" />
            <Label htmlFor="ai-file" className="text-sm font-medium">
              2. Subí el archivo (CSV o Excel)
            </Label>
          </div>
          <Input
            id="ai-file"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            disabled={analyzing}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            La IA lee los encabezados y una muestra para mapear las columnas.
            Después revisás cómo quedó antes de confirmar.
          </p>
          <Button
            onClick={handleAnalyze}
            disabled={!file || analyzing}
            className="w-fit"
          >
            {analyzing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Analizando con IA…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Analizar con IA
              </>
            )}
          </Button>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Paso 2: revisión
  // --------------------------------------------------------------------------
  const s = result?.stats;
  return (
    <div className="flex flex-col gap-6">
      {s && (
        <div className="flex flex-wrap gap-2 text-sm">
          <StatChip label="Total" value={s.total} className="bg-muted" />
          <StatChip label="OK" value={s.ok} className={STATUS_CLASSES.ok} />
          <StatChip
            label="Con avisos"
            value={s.warning}
            className={STATUS_CLASSES.warning}
          />
          <StatChip
            label="Duplicados"
            value={s.duplicate}
            className={STATUS_CLASSES.duplicate}
          />
          <StatChip
            label="Con error"
            value={s.error}
            className={STATUS_CLASSES.error}
          />
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Mapeo de columnas</p>
          {pending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {mapping?.notes && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {mapping.notes}
          </p>
        )}
        <div className="max-h-[40vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Columna del archivo</TableHead>
                <TableHead className="text-xs">Campo destino</TableHead>
                <TableHead className="w-24 text-xs">Confianza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapping?.columns.map((col) => (
                <TableRow key={col.source}>
                  <TableCell className="text-xs font-medium">
                    {col.source}
                    {col.note && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {col.note}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={col.target}
                      onValueChange={(v) => updateColumnTarget(col.source, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Math.round(col.confidence * 100)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
          <Label className="flex items-center gap-1.5 text-xs font-medium">
            <Wand2 className="size-3.5" /> Regenerar lectura con una instrucción
          </Label>
          <div className="flex gap-2">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='Ej: "La columna telefono2 es un segundo teléfono, ignorala. modelo es el modelo del auto."'
              className="min-h-[60px] text-xs"
            />
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={pending}
              className="self-end"
            >
              <Sparkles className="size-4" /> Regenerar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium">
          Vista previa {result && `(primeras ${result.preview.length})`}
        </p>
        <div className="max-h-[45vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs">Nombre</TableHead>
                <TableHead className="text-xs">Teléfono</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Vehículo</TableHead>
                <TableHead className="text-xs">Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.preview.map((row) => (
                <TableRow key={row.index}>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                        STATUS_CLASSES[row.status],
                      )}
                      title={[...row.errors, ...row.warnings].join(" · ")}
                    >
                      {MAPPED_STATUS_META[row.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {[row.data.first_name, row.data.last_name]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.data.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.data.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {[row.data.vehicle_brand, row.data.vehicle_model]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {row.data.initial_notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            setStep("setup");
            setMapping(null);
            setResult(null);
          }}
          disabled={committing}
        >
          Volver
        </Button>
        <Button
          onClick={handleCommit}
          disabled={committing || !s || s.ok + s.warning === 0}
        >
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Importando…
            </>
          ) : (
            `Confirmar y subir ${s ? s.ok + s.warning : 0} lead(s)`
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function PickSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatChip({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        className,
      )}
    >
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}

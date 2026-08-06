"use client";

import { Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
  PRICE_TARGET_FIELDS,
  PRICE_TARGET_LABELS,
  type PriceColumnMapping,
  type PriceMappedRow,
  type PriceMapping,
  type PriceMappingStats,
} from "@/lib/price-import";
import {
  analyzePriceImport,
  bulkImportPrices,
  reapplyPriceMapping,
  regeneratePriceMapping,
  type PriceAnalyzeResult,
} from "@/app/(app)/admin/prices/actions";

type Props = { redirectTo: string };
type Step = "setup" | "analyzing" | "review";

const TARGET_OPTIONS = [
  ...PRICE_TARGET_FIELDS.map((f) => ({ value: f.key, label: f.label })),
  { value: "ignore", label: PRICE_TARGET_LABELS.ignore },
];

export function AiPricesImporter({ redirectTo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [committing, setCommitting] = useState(false);

  const [step, setStep] = useState<Step>("setup");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  const [mapping, setMapping] = useState<PriceMapping | null>(null);
  const [stats, setStats] = useState<PriceMappingStats | null>(null);
  const [preview, setPreview] = useState<PriceMappedRow[]>([]);
  const [instruction, setInstruction] = useState("");

  function applyResult(res: PriceAnalyzeResult) {
    if (!res.ok) {
      toast.error(res.message);
      setStep(mapping ? "review" : "setup");
      return;
    }
    setMapping(res.mapping);
    setStats(res.stats);
    setPreview(res.preview);
    setStep("review");
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }

  async function handleAnalyze() {
    if (!file) {
      toast.error("Elegí un archivo primero");
      return;
    }
    setStep("analyzing");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        toast.error("El archivo no tiene hojas");
        setStep("setup");
        return;
      }
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: false,
      });
      const hdrs = ((matrix[0] as unknown[]) ?? [])
        .map((h) => String(h ?? "").trim())
        .filter(Boolean);
      const rows = XLSX.utils
        .sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false })
        .map((r) => {
          const out: Record<string, string> = {};
          for (const h of hdrs) out[h] = String(r[h] ?? "").trim();
          return out;
        })
        .filter((r) => Object.values(r).some((v) => v.length > 0));

      if (hdrs.length === 0 || rows.length === 0) {
        toast.error("No pude leer columnas ni filas del archivo");
        setStep("setup");
        return;
      }
      setHeaders(hdrs);
      setRawRows(rows);
      startTransition(async () => {
        const res = await analyzePriceImport({ headers: hdrs, rows });
        applyResult(res);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pude leer el archivo");
      setStep("setup");
    }
  }

  function handleRegenerate() {
    if (!instruction.trim()) {
      toast.error("Escribí una instrucción para regenerar");
      return;
    }
    startTransition(async () => {
      const res = await regeneratePriceMapping({ headers, rows: rawRows, instruction });
      if (res.ok) toast.success("Mapeo regenerado");
      applyResult(res);
    });
  }

  function updateColumnTarget(source: string, target: string) {
    if (!mapping) return;
    const next: PriceMapping = {
      ...mapping,
      columns: mapping.columns.map((c): PriceColumnMapping =>
        c.source === source
          ? { ...c, target, confidence: 1, note: "Editado a mano" }
          : c,
      ),
    };
    setMapping(next);
    startTransition(async () => {
      const res = await reapplyPriceMapping({ rows: rawRows, mapping: next });
      if (res.ok) {
        setStats(res.stats);
        setPreview(res.preview);
      } else toast.error(res.message);
    });
  }

  function handleConfirm() {
    if (!mapping) return;
    setCommitting(true);
    startTransition(async () => {
      // Reaplicamos en el server para obtener las filas OK ya normalizadas.
      const res = await reapplyPriceMapping({ rows: rawRows, mapping });
      if (!res.ok) {
        setCommitting(false);
        toast.error(res.message);
        return;
      }
      if (res.okRows.length === 0) {
        setCommitting(false);
        toast.error("No hay filas válidas para importar");
        return;
      }
      const commit = await bulkImportPrices(res.okRows);
      setCommitting(false);
      if (!commit.ok) {
        toast.error(commit.message);
        return;
      }
      toast.success(
        `Importados: ${commit.inserted}${commit.failed ? ` · Saltados: ${commit.failed}` : ""}`,
      );
      router.push(redirectTo);
      router.refresh();
    });
  }

  // --------------------------------------------------------------------------
  // Paso 1: subir archivo
  // --------------------------------------------------------------------------
  if (step === "setup" || step === "analyzing") {
    const analyzing = step === "analyzing";
    return (
      <Card className="flex flex-col gap-3 border-dashed p-6">
        <div className="flex items-center gap-3">
          <Upload className="size-4 text-muted-foreground" />
          <Label htmlFor="ai-price-file" className="text-sm font-medium">
            Subí la lista de precios (CSV o Excel)
          </Label>
        </div>
        <Input
          id="ai-price-file"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
          disabled={analyzing}
          onChange={pick}
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          No importa cómo se llamen las columnas: la IA lee los encabezados y una
          muestra de filas, mapea a marca / modelo / versión / año / precio /
          moneda / tipo / notas, y después revisás cómo quedó antes de confirmar.
        </p>
        <Button onClick={handleAnalyze} disabled={!file || analyzing} className="w-fit">
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
    );
  }

  // --------------------------------------------------------------------------
  // Paso 2: revisión del mapeo + preview
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {stats && (
        <div className="flex flex-wrap gap-2 text-sm">
          <StatChip label="Total" value={stats.total} className="bg-muted" />
          <StatChip label="OK" value={stats.ok} className="bg-green-100 text-green-700" />
          <StatChip
            label="Con error"
            value={stats.error}
            className="bg-red-100 text-red-700"
          />
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Mapeo de columnas</p>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
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
              placeholder='Ej: "La columna PVP es el precio de lista. La columna cod es un código interno, ignorala."'
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
          Vista previa {preview.length > 0 && `(primeras ${preview.length})`}
        </p>
        <div className="max-h-[45vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs">Marca</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Versión</TableHead>
                <TableHead className="text-xs">Año</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Moneda</TableHead>
                <TableHead className="text-right text-xs">Precio</TableHead>
                <TableHead className="text-xs">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row) => (
                <TableRow key={row.index}>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                        row.status === "ok"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700",
                      )}
                    >
                      {row.status === "ok" ? "OK" : "Error"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.brand || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.model || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.version || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.model_year || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.product_type_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.data.currency || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                    {row.data.list_price || "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] text-[11px] text-amber-700">
                    {row.errors.join(" · ") || "—"}
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
            setStats(null);
            setPreview([]);
          }}
          disabled={committing}
        >
          Volver
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={committing || !stats || stats.ok === 0}
        >
          {committing ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Importando…
            </>
          ) : (
            `Confirmar e importar ${stats ? stats.ok : 0} precio(s)`
          )}
        </Button>
      </div>
    </div>
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

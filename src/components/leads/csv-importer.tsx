"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  CSV_HEADERS,
  CSV_HEADER_LABELS,
  parseCsv,
  validateCsvRow,
  type CsvHeader,
  type CsvRow,
} from "@/lib/leads";

import {
  bulkInsertLeads,
  type BulkInsertResult,
} from "@/app/(app)/admin/leads/actions";

import type { LeadFormOption } from "./lead-form";

type Props = {
  branches: LeadFormOption[];
  productTypes: LeadFormOption[];
  campaigns: LeadFormOption[];
  redirectTo: string;
  // Provider no clasifica al subir — todo va al pool. Admin sí puede setear defaults.
  showDefaults?: boolean;
};

export function CsvImporter({
  branches,
  productTypes,
  campaigns,
  redirectTo,
  showDefaults = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [defaults, setDefaults] = useState({
    branch_id: "",
    product_type_id: "",
    campaign_id: "",
  });
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkInsertResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows: parsed, errors } = parseCsv(text);
    setRows(parsed);
    setParseErrors(errors);
    setBulkResult(null);
    if (parsed.length === 0) {
      toast.error("El CSV no contiene filas válidas");
    } else {
      toast.success(`${parsed.length} fila(s) listas para revisar`);
    }
  }

  function updateCell(rowIndex: number, header: CsvHeader, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [header]: value } : row)),
    );
  }

  function deleteRow(rowIndex: number) {
    setRows((prev) => prev.filter((_, i) => i !== rowIndex));
  }

  function submit() {
    startTransition(async () => {
      const result = await bulkInsertLeads(rows, {
        branch_id: defaults.branch_id || undefined,
        product_type_id: defaults.product_type_id || undefined,
        campaign_id: defaults.campaign_id || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setBulkResult(result);
      if (result.failed === 0) {
        toast.success(`${result.inserted} lead(s) importados`);
        setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 1000);
      } else {
        toast.warning(
          `Importados ${result.inserted}, con ${result.failed} errores`,
        );
      }
    });
  }

  const totalErrors = rows.reduce(
    (acc, r) => acc + validateCsvRow(r).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-6">
        <div className="flex items-center gap-3">
          <Upload className="size-4 text-muted-foreground" />
          <Label htmlFor="csv-input" className="text-sm font-medium">
            Cargar archivo CSV
          </Label>
        </div>
        <Input
          id="csv-input"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Headers esperados (lowercase, snake_case): {CSV_HEADERS.join(", ")}
        </p>
        {parseErrors.length > 0 && (
          <div className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-text">
            <p className="font-medium">Avisos del parser:</p>
            <ul className="ml-4 list-disc">
              {parseErrors.slice(0, 3).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showDefaults && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Sucursal por defecto (opcional)</Label>
            <Select
              value={defaults.branch_id}
              onValueChange={(v) =>
                setDefaults((d) => ({ ...d, branch_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="— Pool" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Tipo producto por defecto</Label>
            <Select
              value={defaults.product_type_id}
              onValueChange={(v) =>
                setDefaults((d) => ({ ...d, product_type_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="— Pool" />
              </SelectTrigger>
              <SelectContent>
                {productTypes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Campaña por defecto</Label>
            <Select
              value={defaults.campaign_id}
              onValueChange={(v) =>
                setDefaults((d) => ({ ...d, campaign_id: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-semibold">{rows.length}</span> fila(s) ·{" "}
              {totalErrors > 0 ? (
                <span className="text-destructive">
                  {totalErrors} error(es) por corregir
                </span>
              ) : (
                <span className="text-success">Sin errores</span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRows([]);
                  setBulkResult(null);
                }}
                disabled={pending}
              >
                Limpiar
              </Button>
              <Button
                onClick={submit}
                disabled={pending || rows.length === 0 || totalErrors > 0}
              >
                {pending
                  ? "Importando…"
                  : `Importar ${rows.length} lead(s)`}
              </Button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {CSV_HEADERS.map((h) => (
                    <TableHead key={h} className="text-xs">
                      {CSV_HEADER_LABELS[h]}
                    </TableHead>
                  ))}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const rowErrors = validateCsvRow(row);
                  return (
                    <TableRow
                      key={idx}
                      className={
                        rowErrors.length > 0 ? "bg-destructive/5" : undefined
                      }
                    >
                      {CSV_HEADERS.map((h) => (
                        <TableCell key={h} className="p-1">
                          <input
                            value={row[h] ?? ""}
                            onChange={(e) => updateCell(idx, h, e.target.value)}
                            className="w-full rounded-sm bg-transparent px-2 py-1 text-xs hover:bg-muted/40 focus:bg-background focus:outline focus:outline-1 focus:outline-accent"
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar fila"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {bulkResult && bulkResult.failed > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">
            {bulkResult.failed} fila(s) no se importaron
          </p>
          <ul className="ml-4 mt-1 list-disc text-xs text-destructive/80">
            {bulkResult.errors.slice(0, 10).map((e, i) => (
              <li key={i}>
                Fila {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

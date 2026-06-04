"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  bulkImportPrices,
  type PriceImportRow,
} from "@/app/(app)/admin/prices/actions";

type Props = {
  redirectTo: string;
};

export function PricesImporter({ redirectTo }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<PriceImportRow[]>([]);
  const [pending, startTransition] = useTransition();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: "",
    });
    const mapped: PriceImportRow[] = parsed.map((r) => ({
      brand: String(r.brand || r.marca || ""),
      model: String(r.model || r.modelo || ""),
      version: String(r.version || r.versión || ""),
      model_year: String(r.year || r.año || r.model_year || ""),
      currency: String(r.currency || r.moneda || "ARS"),
      list_price: String(r.list_price || r.precio || r.price || ""),
      product_type_name: String(r.product_type || r.tipo || ""),
      notes: String(r.notes || r.observaciones || ""),
    }));
    setRows(mapped);
    toast.success(`${mapped.length} fila(s) detectadas`);
  }

  function submit() {
    if (rows.length === 0) {
      toast.error("No hay filas para importar");
      return;
    }
    startTransition(async () => {
      const result = await bulkImportPrices(rows);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `Importados: ${result.inserted}. Saltados: ${result.failed}`,
      );
      setRows([]);
      router.push(redirectTo);
      router.refresh();
    });
  }

  function reset() {
    setRows([]);
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <Input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={pick}
        disabled={pending}
        className="bg-card"
      />

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Vista previa ({rows.length} filas)
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              disabled={pending}
            >
              <Trash2 className="size-3" /> Descartar
            </button>
          </div>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left">Marca</th>
                  <th className="px-2 py-1 text-left">Modelo</th>
                  <th className="px-2 py-1 text-left">Versión</th>
                  <th className="px-2 py-1 text-left">Año</th>
                  <th className="px-2 py-1 text-left">Tipo</th>
                  <th className="px-2 py-1 text-right">Precio</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr
                    key={i}
                    className="border-b bg-card last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-2 py-1">{r.brand || "—"}</td>
                    <td className="px-2 py-1">{r.model || "—"}</td>
                    <td className="px-2 py-1">{r.version || "—"}</td>
                    <td className="px-2 py-1">{r.model_year || "—"}</td>
                    <td className="px-2 py-1">{r.product_type_name || "—"}</td>
                    <td className="px-2 py-1 text-right">
                      {r.list_price || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="border-t bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                Mostrando primeras 50 de {rows.length}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={pending || rows.length === 0}
          className="gap-2"
        >
          <Upload className="size-4" />
          {pending
            ? "Importando…"
            : rows.length > 0
              ? `Importar ${rows.length}`
              : "Importar"}
        </Button>
      </div>
    </Card>
  );
}

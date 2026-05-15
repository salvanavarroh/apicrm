"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { bulkImportPrices, type PriceImportRow } from "./actions";

type Props = {
  trigger: ReactNode;
  productTypes: { id: string; label: string }[];
};

export function PricesImportDialog({ trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    startTransition(async () => {
      const result = await bulkImportPrices(rows);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `Importados: ${result.inserted}. Saltados: ${result.failed}`,
      );
      setOpen(false);
      setRows([]);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar precios</DialogTitle>
          <DialogDescription>
            Cargá un Excel o CSV con columnas: brand, model, version, year,
            list_price, currency, product_type, notes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={pick}
          />
          {rows.length > 0 && (
            <div className="max-h-60 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-2 py-1 text-left">Marca</th>
                    <th className="px-2 py-1 text-left">Modelo</th>
                    <th className="px-2 py-1 text-left">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1">{r.brand || "—"}</td>
                      <td className="px-2 py-1">{r.model || "—"}</td>
                      <td className="px-2 py-1">{r.list_price || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className="border-t bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                  Mostrando primeras 20 de {rows.length}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || rows.length === 0}>
            {pending ? "Importando…" : (
              <>
                <Upload className="mr-2 size-4" /> Importar {rows.length}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

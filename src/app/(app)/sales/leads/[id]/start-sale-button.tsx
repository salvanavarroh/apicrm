"use client";

import { Handshake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatARS } from "@/lib/format";

import { initiateSale } from "@/app/(app)/sales/sales/actions";

type Quote = { id: string; total: number; modality: string; created_at: string };

type Props = {
  leadId: string;
  quotes: Quote[];
};

export function StartSaleButton({ leadId, quotes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState(
    quotes[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!selectedQuoteId) {
      toast.error("Elegí una cotización");
      return;
    }
    startTransition(async () => {
      const result = await initiateSale({
        lead_id: leadId,
        quote_id: selectedQuoteId,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Venta iniciada — esperando aprobación del Admin");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        disabled={quotes.length === 0}
        title={quotes.length === 0 ? "Generá un presupuesto primero" : ""}
      >
        <Handshake className="mr-2 size-4" /> Iniciar venta
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar venta</DialogTitle>
          <DialogDescription>
            La venta queda &quot;En evaluación&quot; hasta que el Admin haga el
            triple check.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
          <SelectTrigger>
            <SelectValue placeholder="Elegí una cotización" />
          </SelectTrigger>
          <SelectContent>
            {quotes.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                #{q.id.slice(0, 8)} · {formatARS(q.total)} · {q.modality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !selectedQuoteId}>
            {pending ? "Iniciando…" : "Iniciar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

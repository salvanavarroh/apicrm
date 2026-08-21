"use client";

import { Car } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { registerUsedCarTake, type UsedCarTake } from "@/app/(app)/admin/valuations/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * La toma del usado en la venta: cotizado → pagado → revendido.
 *
 * Es el dato que cierra el círculo. Con la tasación sola nunca se sabe si el
 * cotizador está bien calibrado; recién cuando se registra lo que se pagó de
 * verdad se puede comparar, y cuando se registra la reventa se sabe si el margen
 * que asume el cotizador es el real.
 */
function money(n: number, currency: "ARS" | "USD" = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function UsedCarTakeCard({
  saleId,
  take,
}: {
  saleId: string;
  take: UsedCarTake;
}) {
  const [paid, setPaid] = useState(take.paid != null ? String(take.paid) : "");
  const [resold, setResold] = useState(
    take.resold != null ? String(take.resold) : "",
  );
  const [pending, start] = useTransition();
  const router = useRouter();

  const q = take.quoted;
  const paidNum = paid === "" ? null : Number(paid);
  const resoldNum = resold === "" ? null : Number(resold);
  const quotedRef = q?.offerSent ?? q?.offerMax ?? null;
  const deviation =
    quotedRef && paidNum ? ((paidNum - quotedRef) / quotedRef) * 100 : null;
  const realMargin =
    paidNum && resoldNum ? ((resoldNum - paidNum) / paidNum) * 100 : null;

  function save() {
    start(async () => {
      const res = await registerUsedCarTake(saleId, {
        paid: paidNum,
        resold: resoldNum,
        valuationId: q?.id ?? null,
      });
      toast[res.ok ? "success" : "error"](res.ok ? "Registrado" : res.message);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="size-4 text-accent" />
          Usado en parte de pago
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {q ? (
          <div className="rounded-md border bg-muted/30 p-2.5 text-sm">
            <p className="font-medium">
              {q.brand} {q.model} {q.year}
            </p>
            <p className="text-xs text-muted-foreground">{q.version}</p>
            <p className="mt-1 text-xs">
              Cotizado:{" "}
              <b>
                {q.offerSent != null
                  ? money(q.offerSent, q.currency)
                  : `${money(q.offerMin, q.currency)} – ${money(q.offerMax, q.currency)}`}
              </b>
              <span className="text-muted-foreground">
                {" "}
                · mercado {money(q.marketValue, q.currency)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta venta no tiene tasación cargada. Se puede registrar lo pagado
            igual, pero sin la cotización no hay con qué comparar.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Se pagó</Label>
            <Input
              type="number"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="16400000"
              className="h-9 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Se revendió en</Label>
            <Input
              type="number"
              value={resold}
              onChange={(e) => setResold(e.target.value)}
              placeholder="(cuando se venda)"
              className="h-9 font-mono"
            />
          </div>
        </div>

        {(deviation != null || realMargin != null) && (
          <div className="flex flex-wrap gap-3 text-xs">
            {deviation != null && (
              <span
                className={cn(
                  "rounded-md px-2 py-1",
                  Math.abs(deviation) <= 5
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning-text",
                )}
              >
                {deviation > 0 ? "Se pagó " : "Se pagó "}
                {Math.abs(deviation).toFixed(1)}%{" "}
                {deviation > 0 ? "más" : "menos"} que lo cotizado
              </span>
            )}
            {realMargin != null && (
              <span
                className={cn(
                  "rounded-md px-2 py-1",
                  realMargin > 0
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                Margen real {realMargin.toFixed(1)}%
              </span>
            )}
          </div>
        )}

        <div>
          <Button size="sm" variant="outline" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

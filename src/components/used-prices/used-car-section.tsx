"use client";

import { Car, ChevronDown, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Valuator } from "@/components/used-prices/valuator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONDITION_LABEL } from "@/lib/used-prices/valuate";
import type { LeadValuation } from "@/app/(app)/admin/valuations/actions";
import { cn } from "@/lib/utils";

/**
 * El usado en parte de pago, dentro de la ficha del lead.
 *
 * Hasta ahora el usado era un campo de texto libre ("un Cronos 2019 más o menos
 * nuevo") y su valor un número tipeado a mano en el presupuesto. Acá pasa a ser
 * un dato: versión exacta de la guía, km, estado y el valor con su desglose.
 *
 * Las tasaciones VENCEN. Los precios de la guía se mueven todos los meses, así
 * que una cotización de hace 40 días está mal y la ficha lo dice en vez de
 * mostrarla como vigente.
 */
const STALE_DAYS = 30;

function money(n: number, currency: "ARS" | "USD" = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export function UsedCarSection({
  leadId,
  valuations,
  /** Ahora en ms, calculado en el server: evita mismatch de hidratación. */
  now,
}: {
  leadId: string;
  valuations: LeadValuation[];
  now: number;
}) {
  const [open, setOpen] = useState(valuations.length === 0);
  const router = useRouter();
  const last = valuations[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="size-4 text-accent" />
          Usado en parte de pago
        </CardTitle>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {open ? "Cerrar" : valuations.length > 0 ? "Cotizar de nuevo" : "Cotizar"}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {valuations.length === 0 && !open && (
          <p className="text-sm text-muted-foreground">
            Sin tasación. Si el cliente entrega un usado, cotizalo acá y queda
            atado al lead.
          </p>
        )}

        {last && (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {last.brand} {last.model} {last.year}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {last.version}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {last.km.toLocaleString("es-AR")} km ·{" "}
                    {CONDITION_LABEL[last.condition]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">
                    {last.offerSent != null ? "Ofrecido" : "Toma sugerida"}
                  </p>
                  <p className="text-lg font-semibold text-accent">
                    {last.offerSent != null
                      ? money(last.offerSent, last.currency)
                      : `${money(last.offerMin, last.currency)} – ${money(last.offerMax, last.currency)}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Mercado {money(last.marketValue, last.currency)}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  hace {daysSince(last.createdAt, now)} d
                </span>
                {last.authorName && <span>· {last.authorName}</span>}
                {last.sentAt && <span>· enviada al cliente</span>}
                {daysSince(last.createdAt, now) > STALE_DAYS && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-text">
                    Vencida — la guía cambió de mes, conviene recotizar
                  </span>
                )}
              </div>
            </div>

            {valuations.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {valuations.length - 1} tasación(es) anterior(es)
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {valuations.slice(1).map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span className="truncate">
                        {v.brand} {v.model} {v.year} · {v.km.toLocaleString("es-AR")} km
                      </span>
                      <span className="shrink-0 font-mono">
                        {money(v.offerSent ?? v.offerMax, v.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {open && (
          <div className="border-t pt-3">
            <Valuator leadId={leadId} onSaved={() => router.refresh()} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

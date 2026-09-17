"use client";

import { ChevronDown, Image as ImageIcon, Megaphone } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  loadLeadAdCreative,
  type LeadAdCreative,
} from "@/lib/lead-ad-creative";

/**
 * El anuncio que el cliente clickeó antes de dejar sus datos.
 *
 * Va PLEGADO: la mayoría de las veces el vendedor abre la ficha para llamar, no
 * para mirar la pieza, y desplegado empujaría hacia abajo el teléfono y las
 * notas. Además la carga es una llamada a la API de Zernio, así que plegado
 * también significa que no se paga en cada ficha que se abre.
 */
export function LeadAdCreativeBlock({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; creative: LeadAdCreative }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || state.kind !== "idle") return;
    setState({ kind: "loading" });
    const res = await loadLeadAdCreative(leadId);
    setState(
      res.ok
        ? { kind: "ok", creative: res.creative }
        : { kind: "error", message: res.message },
    );
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Megaphone className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Anuncio que vio</span>
          <span className="block text-xs text-muted-foreground">
            La pieza de Meta desde la que dejó sus datos
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {state.kind === "loading" && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Buscando el anuncio…
            </p>
          )}

          {state.kind === "error" && (
            <p className="py-4 text-sm text-muted-foreground">{state.message}</p>
          )}

          {state.kind === "ok" && (
            <div className="flex flex-col gap-3">
              {(state.creative.name ||
                state.creative.campaign ||
                state.creative.adSet) && (
                <div className="text-sm">
                  {state.creative.name && (
                    <p className="font-medium">{state.creative.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[state.creative.campaign, state.creative.adSet]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              )}

              {state.creative.media.length === 0 ? (
                <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <ImageIcon className="size-3.5 shrink-0" />
                  Meta no devolvió la pieza de este anuncio. Puede estar pausado
                  o ser un formato sin imagen.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {state.creative.media.map((m, i) =>
                    m.type === "video" ? (
                      <video
                        key={i}
                        src={m.url}
                        poster={m.thumbnailUrl}
                        controls
                        className="max-h-80 w-full max-w-sm rounded-lg border bg-black"
                      />
                    ) : (
                      // Sin next/image: las URLs de Meta vienen firmadas y
                      // cambian, así que no hay dominio estable que configurar.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={m.url}
                        alt={state.creative.name ?? "Creatividad del anuncio"}
                        className="max-h-80 w-full max-w-sm rounded-lg border object-contain"
                      />
                    ),
                  )}
                </div>
              )}

              <p className="font-mono text-[11px] text-muted-foreground">
                ad {state.creative.adId}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

"use client";

// ============================================================================
// El lanzador flotante. Va montado en el layout de la app, así que el asistente
// está en TODAS las pantallas: si hay que ir a buscarlo a una sección, no se usa.
//
// En desktop es un panel de 400px anclado abajo a la derecha. En mobile ocupa la
// pantalla entera, porque un panel de 400px en un teléfono es una pantalla
// entera igual pero mal hecha.
// ============================================================================

import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantChat, type Suggestion } from "@/components/assistant/assistant-chat";
import { cn } from "@/lib/utils";

export function AssistantWidget({
  suggestions,
  greeting,
}: {
  suggestions: Suggestion[];
  greeting: string;
}) {
  const [open, setOpen] = useState(false);

  // Escape cierra. Es lo que espera cualquiera y evita el panel pegado abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar el asistente" : "Abrir el asistente"}
        className={cn(
          "fixed right-4 bottom-4 z-50 flex size-12 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-accent text-accent-foreground hover:brightness-110",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          open && "rotate-90",
        )}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Asistente del CRM"
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card shadow-2xl",
            // Mobile: pantalla completa.
            "inset-0 rounded-none",
            // Desktop: panel anclado, dejando lugar al botón.
            "sm:inset-auto sm:right-4 sm:bottom-20 sm:h-[min(38rem,calc(100vh-8rem))] sm:w-[26rem] sm:rounded-xl sm:border",
          )}
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              <span className="text-sm font-semibold">Asistente</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <AssistantChat suggestions={suggestions} greeting={greeting} />
        </div>
      )}
    </>
  );
}

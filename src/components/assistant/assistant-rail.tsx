"use client";

// ============================================================================
// El asistente como RIEL LATERAL, no como globo flotante.
//
// El globo tapaba contenido y competía con los botones de cada pantalla. El riel
// es una franja angosta y permanente pegada al borde derecho: se ve siempre, no
// tapa nada, y al tocarla se despliega un panel que EMPUJA el contenido en vez
// de superponerse. Eso importa cuando el asistente te está diciendo "entrá a
// Leads" y necesitás ver Leads al mismo tiempo.
//
// Riel y panel son hermanos del contenido dentro del flex del shell, así que el
// empuje lo hace el layout solo. En mobile no hay lugar para una franja
// permanente: ahí el riel se esconde y queda un botón chico, y el panel ocupa la
// pantalla completa.
// ============================================================================

import { Bug, PanelRightClose, Plus, X } from "lucide-react";

import { Logo } from "@/components/logo";
import { useEffect, useState } from "react";

import {
  AssistantChat,
  type Suggestion,
} from "@/components/assistant/assistant-chat";
import { ReportForm } from "@/components/assistant/report-form";
import { cn } from "@/lib/utils";

type Mode = { kind: "chat" } | { kind: "report"; threadId: string | null; text: string };

export function AssistantRail({
  suggestions,
  greeting,
  open,
  setOpen,
}: {
  suggestions: Suggestion[];
  greeting: string;
  /**
   * El estado vive en `AppShell` y no acá porque el botón "Ayuda" del menú
   * también abre el panel: son dos disparadores para una misma cosa.
   */
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "chat" });
  // Cambiar esta clave remonta el chat: es el "conversación nueva".
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const openReport = (ctx: { threadId: string | null; question: string }) => {
    // Arranca con lo que la persona ya escribió: si tuvo que contarlo dos veces,
    // la segunda no lo cuenta.
    setMode({ kind: "report", threadId: ctx.threadId, text: ctx.question });
    setOpen(true);
  };

  const panelBody =
    mode.kind === "report" ? (
      <ReportForm
        threadId={mode.threadId}
        initialText={mode.text}
        onBack={() => setMode({ kind: "chat" })}
      />
    ) : (
      <AssistantChat
        key={chatKey}
        suggestions={suggestions}
        greeting={greeting}
        onReport={openReport}
      />
    );

  // UN SOLO panel para desktop y mobile. La primera versión tenía dos (uno con
  // `lg:hidden` y otro con `hidden lg:flex`) y eso son DOS instancias del chat:
  // dos conversaciones distintas, y al cambiar de tamaño la pantalla se perdía
  // el hilo. Lo que cambia por breakpoint son las clases, no el árbol.
  return (
    <>
      {/* ------------------------------------------------- riel (desktop) -- */}
      {/* Dos capas a propósito. Si el fondo oscuro y el hover viven en el MISMO
          elemento, `hover:bg-white/7%` REEMPLAZA al oscuro en vez de aclararlo:
          el blanco translúcido queda compuesto sobre la página clara y la franja
          se lava entera. Con el oscuro en el contenedor, el hover del botón se
          compone sobre él y aclara, que es lo que uno espera. Es el mismo motivo
          por el que los ítems del menú se ven bien: su fondo lo pone el aside. */}
      <div className="hidden w-11 shrink-0 border-l border-sidebar-border bg-sidebar lg:block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Cerrar el asistente" : "Abrir el asistente"}
          className={cn(
            "flex h-full w-full flex-col items-center gap-3 py-4 transition-colors",
            "text-sidebar-muted hover:bg-white/[0.07] hover:text-sidebar-foreground",
            open && "bg-white/[0.07] text-sidebar-accent",
          )}
        >
          <span className="relative">
            <Logo size={20} mark />
            {/* El punto dice "está disponible", sin ocupar una línea de texto. */}
            <span className="absolute -top-1 -right-1.5 size-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-xs font-medium tracking-wide [writing-mode:vertical-rl]">
            Agente de API
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------- el panel -- */}
      {open && (
        <aside
          role="dialog"
          aria-label="Agente de API"
          className={cn(
            "flex flex-col bg-card",
            // Mobile: pantalla completa. Un panel de 26rem en un teléfono es la
            // pantalla entera igual, pero mal hecha.
            "fixed inset-0 z-50",
            // Desktop: columna en el flujo, así EMPUJA el contenido.
            "lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l",
          )}
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar el asistente"
              title="Cerrar"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightClose className="hidden size-4 lg:block" />
              <X className="size-4 lg:hidden" />
            </button>

            <Logo size={16} mark />
            <span className="text-sm font-semibold">Agente de API</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              beta
            </span>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setMode({ kind: "report", threadId: null, text: "" })
                }
                aria-label="Reportar un problema"
                title="Reportar un problema"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Bug className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode({ kind: "chat" });
                  setChatKey((k) => k + 1);
                }}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
              >
                <Plus className="size-3.5" /> Nuevo
              </button>
            </div>
          </header>

          {panelBody}
        </aside>
      )}

      {/* ------------------------------- botón flotante, sólo en mobile ---- */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir el asistente"
          className="fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg lg:hidden"
        >
          <Logo size={22} mark />
        </button>
      )}
    </>
  );
}

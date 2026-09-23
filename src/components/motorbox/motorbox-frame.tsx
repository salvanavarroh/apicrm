"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// ============================================================================
// El iframe de Motorbox.
//
// Motorbox vive en motorbox.apicrm.ai — mismo dominio registrable que el CRM,
// así que su cookie de sesión NO es de tercera parte y funciona en todos los
// navegadores, Safari incluido. Ver docs/motorbox-spec-api.md §5.
//
// El protocolo de mensajes está en §8.2 del spec de Motorbox. Todo mensaje
// lleva `v: 1`; los de otra versión u otro origen se ignoran en silencio.
// ============================================================================

const PROTOCOL_VERSION = 1;

/** Si Motorbox no dice "listo" en este tiempo, mostramos el fallback. */
const READY_TIMEOUT_MS = 15_000;

type InboundMessage =
  | { v: number; type: "motorbox:ready"; dealerId?: string; onboarded?: boolean }
  | { v: number; type: "motorbox:need-ticket"; reason?: string }
  | { v: number; type: "motorbox:onboarding-completed"; dealerId?: string }
  | { v: number; type: "motorbox:navigate"; href: string; target?: "parent" | "blank" }
  | { v: number; type: "motorbox:error"; code?: string; message?: string }
  | { v: number; type: "motorbox:title"; title?: string };

export function MotorboxFrame({
  initialUrl,
  embedOrigin,
}: {
  initialUrl: string;
  embedOrigin: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se renueva sola cuando Motorbox pide un ticket nuevo, así que la guardamos
  // en estado en vez de leerla del iframe (cross-origin: no se puede leer).
  const [src, setSrc] = useState(initialUrl);

  const post = useCallback(
    (msg: Record<string, unknown>) => {
      // targetOrigin explícito SIEMPRE. Nunca "*": mandaría el ticket a
      // cualquier cosa que estuviera cargada en el iframe.
      frameRef.current?.contentWindow?.postMessage(
        { v: PROTOCOL_VERSION, ...msg },
        embedOrigin,
      );
    },
    [embedOrigin],
  );

  const requestTicket = useCallback(async () => {
    try {
      const res = await fetch("/api/motorbox/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setError(
          data.error === "company_suspended"
            ? "La cuenta está suspendida."
            : "No pudimos renovar la sesión de Motorbox.",
        );
        return;
      }
      // El iframe navega solo: le pasamos la URL y él hace location.replace,
      // así el ticket no queda en el historial.
      post({ type: "api:ticket", url: data.url });
    } catch {
      setError("No pudimos renovar la sesión de Motorbox.");
    }
  }, [post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Comparación EXACTA. Nada de endsWith/includes: "motorbox.apicrm.ai.evil.com"
      // pasaría un endsWith mal escrito.
      if (event.origin !== embedOrigin) return;
      const msg = event.data as InboundMessage | null;
      if (!msg || msg.v !== PROTOCOL_VERSION) return;

      switch (msg.type) {
        case "motorbox:ready":
          setReady(true);
          setError(null);
          post({ type: "api:theme", theme: resolvedTheme === "dark" ? "dark" : "light" });
          break;
        case "motorbox:need-ticket":
          void requestTicket();
          break;
        case "motorbox:onboarding-completed":
          toast.success("Tu concesionaria ya está publicada en Motorbox");
          break;
        case "motorbox:navigate":
          if (!msg.href) break;
          if (msg.target === "blank") {
            window.open(msg.href, "_blank", "noopener,noreferrer");
          } else if (msg.href.startsWith("/")) {
            // Sólo rutas internas del CRM: Motorbox no navega el parent a otro sitio.
            router.push(msg.href);
          }
          break;
        case "motorbox:error":
          setError(msg.message ?? "Motorbox devolvió un error.");
          break;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedOrigin, post, requestTicket, resolvedTheme, router]);

  // El tema del CRM se refleja en el iframe. Sin esto queda un panel blanco
  // dentro de un CRM oscuro.
  useEffect(() => {
    if (!ready) return;
    post({ type: "api:theme", theme: resolvedTheme === "dark" ? "dark" : "light" });
  }, [ready, resolvedTheme, post]);

  // El `onError` de un iframe cross-origin no dispara nunca: el único modo
  // confiable de detectar que no cargó es no haber recibido `motorbox:ready`.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      if (!ready) setError("No pudimos cargar Motorbox.");
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready, src]);

  const openInNewTab = useCallback(async () => {
    const res = await fetch("/api/motorbox/ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embed: false }),
    });
    const data = (await res.json()) as { ok: boolean; url?: string };
    if (data.ok && data.url) window.open(data.url, "_blank", "noopener,noreferrer");
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setReady(false);
    // Cache-buster: sin esto el iframe no recarga si la URL es idéntica.
    setSrc((u) => `${u}${u.includes("#") ? "" : `#r${Date.now()}`}`);
    void requestTicket();
  }, [requestTicket]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!ready && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Abriendo Motorbox…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <AlertTriangle className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Podés reintentar o abrirlo en una pestaña nueva.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={retry}>
                Reintentar
              </Button>
              <Button size="sm" onClick={() => void openInNewTab()}>
                <ExternalLink className="size-4" />
                Abrir en pestaña nueva
              </Button>
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={frameRef}
        src={src}
        title="Motorbox"
        // La cámara hace falta para sacarle una foto a un auto desde el celular
        // y subirla: es como se carga el stock en la práctica.
        allow="camera; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}

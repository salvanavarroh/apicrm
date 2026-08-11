"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  inboxHeartbeat,
  setInboxAvailable,
} from "@/app/(app)/admin/inbox/actions";

const HEARTBEAT_MS = 120_000; // 2 min — mantiene "fresca" la presencia

/**
 * Toggle "Activo" del call center. Cuando está activo, el vendedor entra al
 * reparto round-robin de conversaciones. Mientras está activo late un heartbeat
 * (auto-apagado por inactividad: si el tab se cierra, deja de latir y el
 * round-robin lo ignora a los ~15 min).
 */
export function PresenceToggle({
  initialAvailable,
  activeCount,
  className,
}: {
  initialAvailable: boolean;
  activeCount?: number;
  className?: string;
}) {
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!available) return;
    const id = setInterval(() => {
      void inboxHeartbeat();
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [available]);

  // Cerrar el browser / la pestaña apaga la presencia al instante.
  //
  // El heartbeat solo no alcanza: deja de latir, pero el round-robin sigue
  // repartiéndole conversaciones hasta que expira la ventana de frescura de
  // 15 min. Un beacon en `pagehide` sí llega aunque el documento se esté
  // destruyendo (un `fetch` normal se cancela).
  //
  // `e.persisted` distingue "cierro" de "paso a background": en mobile, cambiar
  // de app manda la página al bfcache y volver la reactiva. Apagar ahí sería un
  // falso negativo, así que sólo se apaga cuando la página se destruye de
  // verdad, y al volver a ser visible se late enseguida para refrescar.
  useEffect(() => {
    if (!available) return;

    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      navigator.sendBeacon?.("/api/inbox/presence");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void inboxHeartbeat();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [available]);

  function toggle() {
    const next = !available;
    setAvailable(next);
    start(async () => {
      const res = await setInboxAvailable(next);
      if (!res.ok) {
        setAvailable(!next);
        toast.error(res.message);
        return;
      }
      toast.success(
        next
          ? "Estás activo — vas a recibir conversaciones"
          : "Estás inactivo — no recibís conversaciones nuevas",
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        available
          ? "Estás recibiendo conversaciones por round-robin. Tocá para desactivar."
          : "Activate para recibir conversaciones nuevas."
      }
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
        // Tokens, no `emerald-*`: los washes hardcodeados no tienen variante
        // dark y el chip quedaba ilegible en tema oscuro.
        available
          ? "border-success/40 bg-success/10 text-success"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          available ? "bg-success" : "bg-muted-foreground/40",
        )}
      />
      {available ? "Activo — recibiendo" : "Inactivo"}
      {typeof activeCount === "number" && activeCount > 0 && (
        <span
          className={cn(
            "text-xs font-normal",
            available ? "text-success/80" : "text-muted-foreground",
          )}
        >
          · {activeCount} activo{activeCount === 1 ? "" : "s"}
        </span>
      )}
    </button>
  );
}

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
        available
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          available ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
      />
      {available ? "Activo — recibiendo" : "Inactivo"}
      {typeof activeCount === "number" && activeCount > 0 && (
        <span
          className={cn(
            "text-xs font-normal",
            available ? "text-emerald-600/80" : "text-muted-foreground",
          )}
        >
          · {activeCount} activo{activeCount === 1 ? "" : "s"}
        </span>
      )}
    </button>
  );
}

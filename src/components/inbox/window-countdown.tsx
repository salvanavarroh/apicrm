"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { windowRemaining } from "@/lib/inbox-format";

// Contador vivo de la ventana de servicio de 24h de WhatsApp.
export function WindowCountdown({
  expiresAt,
  className,
}: {
  expiresAt: string | null;
  className?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { text, urgent, expired } = windowRemaining(expiresAt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        expired
          ? "bg-red-100 text-red-700"
          : urgent
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700",
        className,
      )}
      title="Ventana de servicio de 24h de WhatsApp"
    >
      <Clock className="size-3" />
      {expired ? "Ventana cerrada" : `Ventana: ${text}`}
    </span>
  );
}

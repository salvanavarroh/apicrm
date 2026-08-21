"use client";

import { X } from "lucide-react";
import { toast } from "sonner";

import { sendMessage } from "@/app/(app)/admin/inbox/actions";
import { Valuator } from "@/components/used-prices/valuator";

/**
 * Cotizador de usados como panel derecho del inbox, igual que la info del lead.
 *
 * Antes vivía sobre el composer y era un error: sus campos empujaban el ancho de
 * la columna del chat y aplastaban la lista de conversaciones. Un panel de ancho
 * fijo no puede empujar nada.
 *
 * El mensaje se manda desde acá y aparece en el hilo por la suscripción realtime
 * de mensajes, así que no hace falta pasarle el refresh del Thread.
 */
export function UsedQuotePanel({
  conversationId,
  leadId,
  onClose,
}: {
  conversationId: string;
  leadId: string | null;
  onClose: () => void;
}) {
  async function send(text: string) {
    const res = await sendMessage(conversationId, text);
    if (!res.ok) toast.error(res.message);
  }

  return (
    // Más ancho que el panel de info (w-80): el cotizador tiene seis campos y
    // nombres de versión largos ("1.3 GSE Drive MT Pack Plus (99cv) (MY23)").
    <div className="flex h-full w-96 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Cotizar un usado</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!leadId && (
          <p className="mb-3 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            Esta conversación todavía no tiene lead. La cotización se guarda igual
            y queda en el historial de la concesionaria, pero no va a aparecer en
            ninguna ficha.
          </p>
        )}
        <Valuator
          leadId={leadId}
          conversationId={conversationId}
          onSend={send}
          compact
        />
      </div>
    </div>
  );
}

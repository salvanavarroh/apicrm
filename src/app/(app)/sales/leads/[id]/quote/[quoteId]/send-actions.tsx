"use client";

import { Mail, MessageCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { markQuoteSent } from "@/app/(app)/sales/leads/[id]/quote/actions";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/lead-templates";

type Props = {
  quoteId: string;
  clientEmail: string | null;
  clientPhone: string | null;
  shareUrl: string | null;
  companyName: string;
};

// El presupuesto es un LINK compartible. "Email" arma el mailto (se envía desde
// el correo del propio vendedor) y WhatsApp el wa.me. Ambos marcan la
// cotización como enviada.
export function QuoteSendActions({
  quoteId,
  clientEmail,
  clientPhone,
  shareUrl,
  companyName,
}: Props) {
  const [, startTransition] = useTransition();

  function markSent() {
    startTransition(() => {
      markQuoteSent(quoteId).catch(() => {});
    });
  }

  function shareEmail() {
    if (!shareUrl) {
      toast.error("No se pudo generar el link del presupuesto");
      return;
    }
    const subject = `Tu presupuesto de ${companyName || "la concesionaria"}`;
    const body = `Hola!\n\nTe paso el presupuesto que charlamos. Lo podés ver acá:\n${shareUrl}\n\nCualquier consulta quedo a disposición.`;
    const to = clientEmail ?? "";
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    markSent();
  }

  function shareWhatsapp() {
    if (!clientPhone) {
      toast.error("El cliente no tiene teléfono cargado");
      return;
    }
    if (!shareUrl) {
      toast.error("No se pudo generar el link del presupuesto");
      return;
    }
    window.open(
      whatsappLink(clientPhone, `Hola! Te paso el presupuesto: ${shareUrl}`),
      "_blank",
    );
    markSent();
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={shareWhatsapp}
        disabled={!clientPhone || !shareUrl}
      >
        <MessageCircle className="mr-2 size-4" /> WhatsApp
      </Button>
      <Button onClick={shareEmail} disabled={!shareUrl}>
        <Mail className="mr-2 size-4" /> Email
      </Button>
    </>
  );
}

"use client";

import { Mail, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { whatsappLink } from "@/lib/lead-templates";

import { sendQuoteByEmail } from "@/app/(app)/sales/leads/[id]/quote/actions";

type Props = {
  quoteId: string;
  clientEmail: string | null;
  clientPhone: string | null;
  pdfUrl: string | null;
  companyName: string;
};

export function QuoteSendActions({
  quoteId,
  clientEmail,
  clientPhone,
  pdfUrl,
  companyName,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState(clientEmail ?? "");
  const [subject, setSubject] = useState(
    `Tu presupuesto de ${companyName || "la concesionaria"}`,
  );
  const [message, setMessage] = useState(
    `Hola! Te paso el presupuesto que charlamos. Cualquier consulta me decís.`,
  );

  function shareWhatsapp() {
    if (!clientPhone) {
      toast.error("El cliente no tiene teléfono cargado");
      return;
    }
    const url = whatsappLink(
      clientPhone,
      `Hola! Te paso el presupuesto: ${pdfUrl ?? ""}`,
    );
    window.open(url, "_blank");
  }

  function sendEmail() {
    startTransition(async () => {
      const result = await sendQuoteByEmail(quoteId, { to, subject, message });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Email enviado");
      setEmailOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={shareWhatsapp}
        disabled={!clientPhone || !pdfUrl}
      >
        <MessageCircle className="mr-2 size-4" /> WhatsApp
      </Button>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogTrigger asChild>
          <Button>
            <Mail className="mr-2 size-4" /> Email
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar presupuesto por email</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs">Para</Label>
              <Input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Asunto</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Mensaje</Label>
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={sendEmail} disabled={pending || !to.includes("@")}>
              {pending ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

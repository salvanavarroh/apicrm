"use client";

import { Copy } from "lucide-react";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LEAD_TEMPLATES,
  applyTemplate,
  whatsappLink,
} from "@/lib/lead-templates";

type Props = {
  trigger: React.ReactNode;
  context: {
    nombre: string;
    nombre_completo: string;
    vendedor: string;
    vehiculo: string;
    concesionaria: string;
    telefono_concesionaria: string;
  };
  leadPhone: string | null;
};

export function TemplatesModal({ trigger, context, leadPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(LEAD_TEMPLATES[0].id);
  const selected =
    LEAD_TEMPLATES.find((t) => t.id === selectedId) ?? LEAD_TEMPLATES[0];
  const body = applyTemplate(selected.body, context);

  function copy() {
    navigator.clipboard.writeText(body);
    toast.success("Texto copiado");
  }

  function openWhatsApp() {
    if (!leadPhone) {
      toast.error("El lead no tiene teléfono cargado");
      return;
    }
    window.open(whatsappLink(leadPhone, body), "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] !max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Plantillas de mensaje</DialogTitle>
          <DialogDescription>
            Elegí una plantilla y enviala por WhatsApp o copiala al portapapeles.
          </DialogDescription>
        </DialogHeader>

        <div className="grid w-full min-w-0 grid-cols-[160px_minmax(0,1fr)] gap-4">
          <ul className="flex min-w-0 flex-col gap-1">
            {LEAD_TEMPLATES.map((t) => (
              <li key={t.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${
                    t.id === selected.id
                      ? "bg-accent/10 font-medium text-accent"
                      : "hover:bg-muted"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {selected.description}
            </p>
            <textarea
              readOnly
              value={body}
              className="min-h-[140px] w-full resize-none rounded-md border bg-white px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={openWhatsApp}
                disabled={!leadPhone}
                size="sm"
                className="bg-[#25D366] text-white hover:bg-[#1ebe5d]"
              >
                <WhatsappIcon className="mr-2 size-4" /> Enviar por WhatsApp
              </Button>
              <Button variant="outline" onClick={copy} size="sm">
                <Copy className="mr-2 size-4" /> Copiar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

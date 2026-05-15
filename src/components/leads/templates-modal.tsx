"use client";

import { Copy, MessageCircle } from "lucide-react";
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plantillas de mensaje</DialogTitle>
          <DialogDescription>
            Elegí una plantilla y enviala por WhatsApp o copiala al portapapeles.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4">
          <ul className="flex flex-col gap-1">
            {LEAD_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
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

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {selected.description}
              </p>
            </div>
            <textarea
              readOnly
              value={body}
              className="min-h-[140px] w-full resize-none rounded-md border bg-muted/30 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={openWhatsApp}
                disabled={!leadPhone}
                className="flex-1"
              >
                <MessageCircle className="mr-2 size-4" /> Enviar por WhatsApp
              </Button>
              <Button variant="outline" onClick={copy} className="flex-1">
                <Copy className="mr-2 size-4" /> Copiar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

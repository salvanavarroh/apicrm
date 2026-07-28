"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listApprovedTemplates,
  sendTemplateMessage,
  type ApprovedTemplate,
} from "@/app/(app)/admin/inbox/actions";

export function TemplateSendDialog({
  conversationId,
  trigger,
  onSent,
}: {
  conversationId: string;
  trigger: React.ReactNode;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ApprovedTemplate[] | null>(null);
  const [pending, start] = useTransition();

  function load() {
    setOpen(true);
    if (templates) return;
    listApprovedTemplates().then(setTemplates);
  }

  function send(t: ApprovedTemplate) {
    start(async () => {
      const res = await sendTemplateMessage(conversationId, t.name, t.language);
      if (res.ok) {
        toast.success("Plantilla enviada");
        setOpen(false);
        onSent?.();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? load() : setOpen(false))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar plantilla aprobada</DialogTitle>
          <DialogDescription>
            Reabren la conversación fuera de la ventana de 24h. Solo se listan las
            aprobadas por Meta.
          </DialogDescription>
        </DialogHeader>

        {templates === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No tenés plantillas aprobadas todavía.{" "}
            <Link className="underline" href="/admin/integraciones?tab=templates">
              Gestionar plantillas
            </Link>
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={`${t.name}-${t.language}`}
                disabled={pending}
                onClick={() => send(t)}
                className="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">{t.language}</span>
                </div>
                {t.body_preview && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.body_preview}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

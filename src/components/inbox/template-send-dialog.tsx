"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
  listApprovedTemplates,
  sendTemplateMessage,
  type ApprovedTemplate,
} from "@/app/(app)/admin/inbox/actions";

// Sustituye los {{n}} del preview con los valores cargados (para la vista previa).
function previewWith(template: ApprovedTemplate, values: string[]): string {
  if (!template.body_preview) return "";
  return template.body_preview.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const idx = template.variables.findIndex((v) => v.pos === Number(n));
    const val = idx >= 0 ? values[idx] : "";
    return val && val.trim() ? val : `{{${n}}}`;
  });
}

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
  const [selected, setSelected] = useState<ApprovedTemplate | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function load() {
    setOpen(true);
    if (templates) return;
    listApprovedTemplates().then(setTemplates);
  }

  function reset() {
    setSelected(null);
    setValues([]);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function doSend(t: ApprovedTemplate, params: string[]) {
    start(async () => {
      const res = await sendTemplateMessage(conversationId, t.name, t.language, params);
      if (res.ok) {
        toast.success("Plantilla enviada");
        close();
        onSent?.();
      } else {
        toast.error(res.message);
      }
    });
  }

  // Al elegir una plantilla: si no tiene variables, se envía directo; si tiene,
  // pasamos al paso de completar variables.
  function pick(t: ApprovedTemplate) {
    if (t.variables.length === 0) {
      doSend(t, []);
      return;
    }
    setSelected(t);
    setValues(t.variables.map(() => ""));
  }

  function submitWithVars() {
    if (!selected) return;
    const params = values.map((v) => v.trim());
    if (params.some((v) => !v)) {
      toast.error("Completá todas las variables");
      return;
    }
    doSend(selected, params);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? load() : close())}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar plantilla aprobada</DialogTitle>
          <DialogDescription>
            Reabren la conversación fuera de la ventana de 24h. Solo se listan las
            aprobadas por Meta.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="text-xs text-muted-foreground underline disabled:opacity-50"
            >
              ← Volver a las plantillas
            </button>

            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{selected.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {selected.language}
                </span>
              </div>
              {selected.body_preview && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {previewWith(selected, values)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {selected.variables.map((v, i) => (
                <div key={v.pos} className="space-y-1">
                  <label className="text-xs font-medium capitalize">{v.label}</label>
                  <input
                    value={values[i] ?? ""}
                    onChange={(e) =>
                      setValues((prev) =>
                        prev.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    placeholder={`Valor para {{${v.pos}}}`}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={submitWithVars} disabled={pending}>
                Enviar
              </Button>
            </div>
          </div>
        ) : templates === null ? (
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
                onClick={() => pick(t)}
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
                {t.variables.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {t.variables.length}{" "}
                    {t.variables.length === 1 ? "variable" : "variables"} para completar
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

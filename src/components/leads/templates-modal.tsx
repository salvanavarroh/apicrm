"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { WhatsappIcon } from "@/components/icons/whatsapp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyTemplate, whatsappLink } from "@/lib/lead-templates";
import {
  createMyTemplate,
  deleteMyTemplate,
  updateMyTemplate,
} from "@/lib/templates-actions";

import { addLeadNote } from "@/app/(app)/admin/leads/actions";

export type TemplateRow = {
  id: string;
  label: string;
  body: string;
  scope: "global" | "user";
};

type Props = {
  trigger: React.ReactNode;
  leadId: string;
  context: {
    nombre: string;
    nombre_completo: string;
    vendedor: string;
    vehiculo: string;
    concesionaria: string;
    telefono_concesionaria: string;
  };
  leadPhone: string | null;
  templates: TemplateRow[];
};

const VARIABLES =
  "{nombre} · {nombre_completo} · {vendedor} · {vehiculo} · {concesionaria}";

export function TemplatesModal({
  trigger,
  leadId,
  context,
  leadPhone,
  templates,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  // Editor: null = cerrado, "new" = crear, id = editar esa propia.
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formBody, setFormBody] = useState("");

  const selected =
    templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;
  const body = selected ? applyTemplate(selected.body, context) : "";

  function copy() {
    navigator.clipboard.writeText(body);
    toast.success("Texto copiado");
  }

  function logActivity(label: string, text: string) {
    startTransition(async () => {
      await addLeadNote(
        leadId,
        `Mensaje enviado por WhatsApp — "${label}":\n${text}`,
        "whatsapp",
      );
      router.refresh();
    });
  }

  function openWhatsApp() {
    if (!leadPhone) {
      toast.error("El lead no tiene teléfono cargado");
      return;
    }
    if (!selected) return;
    window.open(whatsappLink(leadPhone, body), "_blank");
    logActivity(selected.label, body);
    setOpen(false);
  }

  function startNew() {
    setEditing("new");
    setFormLabel("");
    setFormBody("");
  }

  function startEdit(t: TemplateRow) {
    setEditing(t.id);
    setFormLabel(t.label);
    setFormBody(t.body);
  }

  function saveForm() {
    startTransition(async () => {
      const res =
        editing === "new"
          ? await createMyTemplate({ label: formLabel, body: formBody })
          : await updateMyTemplate(editing as string, {
              label: formLabel,
              body: formBody,
            });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(editing === "new" ? "Plantilla creada" : "Plantilla guardada");
      setEditing(null);
      router.refresh();
    });
  }

  function removeTemplate(id: string) {
    startTransition(async () => {
      const res = await deleteMyTemplate(id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Plantilla eliminada");
      if (selectedId === id) setSelectedId(templates[0]?.id ?? "");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] !max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Plantillas de mensaje</DialogTitle>
          <DialogDescription>
            Globales (del sistema) y tuyas. Variables: {VARIABLES}
          </DialogDescription>
        </DialogHeader>

        {editing !== null ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Ej: Seguimiento financiación"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Mensaje</Label>
              <Textarea
                rows={5}
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder="Hola {nombre}! ..."
              />
              <p className="text-[11px] text-muted-foreground">
                Variables disponibles: {VARIABLES}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveForm}
                disabled={pending || !formLabel.trim() || !formBody.trim()}
              >
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid w-full min-w-0 grid-cols-[200px_minmax(0,1fr)] gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <ul className="flex max-h-[40vh] min-w-0 flex-col gap-1 overflow-y-auto">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                      t.id === selected?.id
                        ? "bg-accent/10 text-accent"
                        : "hover:bg-muted"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                    >
                      <span className="truncate">{t.label}</span>
                      {t.scope === "global" && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                          sistema
                        </span>
                      )}
                    </button>
                    {t.scope === "user" && (
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTemplate(t.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={startNew}
                className="mt-1 justify-start"
              >
                <Plus className="mr-1 size-3.5" /> Nueva plantilla
              </Button>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <textarea
                readOnly
                value={body}
                className="min-h-[160px] w-full resize-none rounded-md border bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={openWhatsApp}
                  disabled={!leadPhone || !selected || pending}
                  size="sm"
                  className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
                >
                  <WhatsappIcon className="mr-2 size-4" /> Enviar por WhatsApp
                </Button>
                <Button
                  variant="outline"
                  onClick={copy}
                  size="sm"
                  disabled={!selected}
                >
                  <Copy className="mr-2 size-4" /> Copiar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

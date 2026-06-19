"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  createGlobalTemplate,
  deleteGlobalTemplate,
  updateGlobalTemplate,
} from "./actions";

export type GlobalTemplate = { id: string; label: string; body: string };

const VARIABLES =
  "{nombre} · {nombre_completo} · {vendedor} · {vehiculo} · {concesionaria} · {telefono_concesionaria}";

export function TemplatesManager({
  templates,
}: {
  templates: GlobalTemplate[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function startNew() {
    setEditing("new");
    setLabel("");
    setBody("");
  }
  function startEdit(t: GlobalTemplate) {
    setEditing(t.id);
    setLabel(t.label);
    setBody(t.body);
  }

  function save() {
    startTransition(async () => {
      const res =
        editing === "new"
          ? await createGlobalTemplate({ label, body })
          : await updateGlobalTemplate(editing as string, { label, body });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(editing === "new" ? "Plantilla creada" : "Plantilla guardada");
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteGlobalTemplate(id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Plantilla eliminada");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {editing !== null ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Nombre</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Mensaje</Label>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hola {nombre}! ..."
            />
            <p className="text-[11px] text-muted-foreground">
              Variables: {VARIABLES}
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
              onClick={save}
              disabled={pending || !label.trim() || !body.trim()}
            >
              Guardar
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={startNew}>
            <Plus className="mr-1 size-4" /> Nueva plantilla global
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {templates.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay plantillas globales.
          </p>
        )}
        {templates.map((t) => (
          <Card key={t.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">{t.label}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {t.body}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => startEdit(t)}
                aria-label="Editar"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8 text-destructive"
                onClick={() => remove(t.id)}
                disabled={pending}
                aria-label="Eliminar"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

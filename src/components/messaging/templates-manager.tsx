"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createWhatsappTemplate,
  seedStandardTemplates,
} from "@/app/(app)/admin/whatsapp-templates/actions";

export type WaChannel = { id: string; display_name: string | null; external_ref: string | null };
export type WaTemplate = {
  id: string;
  zernio_template_name: string;
  language: string;
  category: string;
  status: string;
  is_standard: boolean;
  body_preview: string | null;
  rejection_reason: string | null;
};
export type StandardTemplateView = {
  name: string;
  category: string;
  body: string;
  status: string | null; // null = todavía no creada en Meta
};

const STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-muted text-muted-foreground",
  DISABLED: "bg-muted text-muted-foreground",
};

export function TemplatesManager({
  channels,
  templates,
  standardSet,
}: {
  channels: WaChannel[];
  templates: WaTemplate[];
  standardSet: StandardTemplateView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("MARKETING");
  const [language, setLanguage] = useState("es_AR");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Inserta una variable {{n}} en la posición del cursor del cuerpo.
  function insertVar(n: number) {
    const token = `{{${n}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Conectá un WhatsApp en{" "}
        <Link className="underline" href="/admin/integraciones?tab=connections">
          Conexiones
        </Link>{" "}
        para
        gestionar plantillas.
      </div>
    );
  }

  function seed() {
    start(async () => {
      const res = await seedStandardTemplates(channelId);
      if (res.ok) {
        toast.success(`${res.created} plantillas enviadas a aprobación`);
        router.refresh();
      } else toast.error(res.message);
    });
  }

  function create() {
    if (!name.trim() || !body.trim()) {
      toast.error("Completá nombre y cuerpo");
      return;
    }
    start(async () => {
      const res = await createWhatsappTemplate({ channelId, name, category, language, body });
      if (res.ok) {
        toast.success("Plantilla enviada a aprobación de Meta");
        setName("");
        setBody("");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Canal:</label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name ?? c.external_ref ?? c.id}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={seed} disabled={pending}>
            Crear set estándar (6)
          </Button>
        </div>

        <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nombre_plantilla (a-z, _)"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
              className="rounded-md border px-2 py-2 text-sm"
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </select>
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="es_AR"
              className="w-24 rounded-md border px-2 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Insertar variable:</span>
              {[
                { n: 1, label: "Nombre" },
                { n: 2, label: "Vehículo" },
                { n: 3, label: "Concesionaria" },
              ].map((v) => (
                <button
                  key={v.n}
                  type="button"
                  onClick={() => insertVar(v.n)}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
                >
                  <Plus className="size-3" />
                  {v.label}
                  <code className="text-muted-foreground">{`{{${v.n}}}`}</code>
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hola {{1}}, te escribo por el {{2}}…"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Al enviar la plantilla vas a completar cada variable con el dato real del
              lead. Tocá un botón para insertarla donde está el cursor.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={create} disabled={pending}>
              Enviar a aprobación
            </Button>
          </div>
        </div>
      </Card>

      {/* Set estándar (pre-creadas): se ven acá con su texto y estado. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Set estándar (recomendado)</h2>
        <div className="space-y-2">
          {standardSet.map((t) => (
            <Card key={t.name} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{t.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {t.category}
                </Badge>
                {t.status ? (
                  <Badge className={STATUS_TONE[t.status] ?? ""}>{t.status}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    pendiente de crear
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Plantillas propias</h2>
        {templates.filter((t) => !t.is_standard).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay plantillas propias.</p>
        ) : (
          templates.filter((t) => !t.is_standard).map((t) => (
            <Card key={t.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{t.zernio_template_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t.language}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {t.category}
                </Badge>
                {t.is_standard && (
                  <Badge variant="outline" className="text-[10px]">
                    estándar
                  </Badge>
                )}
                <Badge className={STATUS_TONE[t.status] ?? ""}>{t.status}</Badge>
              </div>
              {t.body_preview && (
                <p className="mt-1 text-xs text-muted-foreground">{t.body_preview}</p>
              )}
              {t.rejection_reason && (
                <p className="mt-1 text-xs text-red-600">Rechazo: {t.rejection_reason}</p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

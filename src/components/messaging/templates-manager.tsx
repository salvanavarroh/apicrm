"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
}: {
  channels: WaChannel[];
  templates: WaTemplate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("MARKETING");
  const [language, setLanguage] = useState("es_AR");
  const [body, setBody] = useState("");

  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Conectá un WhatsApp en <a className="underline" href="/admin/channels">Canales</a> para
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
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hola {{1}}, te escribo por el {{2}}…"
            rows={3}
            className="rounded-md border px-3 py-2 text-sm sm:col-span-2"
          />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Variables: <code>{"{{1}}"}</code> nombre · <code>{"{{2}}"}</code> vehículo ·{" "}
            <code>{"{{3}}"}</code> concesionaria.
          </p>
          <div className="sm:col-span-2">
            <Button onClick={create} disabled={pending}>
              Enviar a aprobación
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay plantillas.</p>
        ) : (
          templates.map((t) => (
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

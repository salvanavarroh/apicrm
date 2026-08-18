"use client";

import { AlertTriangle, Bot, Info, Pencil, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HARD_BLOCKLIST } from "@/lib/bot/base-intents";
import { cn } from "@/lib/utils";

import {
  saveBotConfig,
  saveBotIntent,
  seedBaseIntents,
  type BotBranchConfig,
  type BotIntentRow,
} from "./actions";

// ============================================================================
// Configuración del bot del inbox.
//
// La pantalla tiene que decir en lenguaje llano QUÉ VA A PASAR, porque nueve
// toggles sueltos no se entienden. De ahí la línea de resumen por sucursal.
// ============================================================================

/** Traduce la config a una frase, que es lo que el admin realmente necesita leer. */
function summarize(c: BotBranchConfig): string {
  if (!c.enabled) return "Apagado: no interviene en ninguna conversación.";
  const when: string[] = [];
  if (c.outsideHours) when.push("fuera del horario de atención");
  if (c.whenNobodyActive) when.push("cuando no hay asesores activos");
  if (c.idleTriggerMinutes) {
    when.push(`si nadie contesta en ${c.idleTriggerMinutes} min`);
  }
  const cuando = when.length ? when.join(", ") : "nunca (no hay disparador activo)";
  const como =
    c.mode === "draft"
      ? "Sugiere la respuesta y la manda el asesor"
      : "Responde solo";
  return `${como}, ${cuando}. Máximo ${c.maxTurns} respuestas por conversación.`;
}

export function BotConfigView({
  configs,
  intents,
}: {
  configs: BotBranchConfig[];
  intents: BotIntentRow[];
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      {/* Qué nunca responde: va arriba porque es la garantía, no un detalle */}
      <Card className="gap-2 border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-destructive" />
          Lo que el bot nunca contesta
        </p>
        <p className="text-xs text-muted-foreground">
          Si el mensaje menciona {HARD_BLOCKLIST.slice(0, 6).join(", ")} u otros
          términos de plata, el bot no responde con contenido: avisa que un asesor
          sigue la conversación y marca al lead como caliente. Esto no se puede
          desactivar desde acá — es lo que evita que prometa un precio o una
          bonificación que no existe.
        </p>
      </Card>

      {/* Config por sucursal */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Por sucursal
        </h2>
        {configs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No hay sucursales activas. Creá una para poder configurar el bot.
          </Card>
        ) : (
          configs.map((c) => (
            <BranchCard key={c.branchId} initial={c} pending={pending} start={start} />
          ))
        )}
      </section>

      {/* Catálogo de preguntas */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Preguntas frecuentes ({intents.length})
          </h2>
          {intents.length === 0 && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await seedBaseIntents();
                  if (!res.ok) toast.error(res.message);
                  else toast.success("Preguntas base cargadas");
                })
              }
            >
              <Sparkles className="mr-2 size-4" /> Cargar las 8 preguntas base
            </Button>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          El bot no redacta: elige cuál de estas respuestas corresponde y la manda
          tal cual la escribiste. Variables: <code>{"{nombre}"}</code>{" "}
          <code>{"{sucursal}"}</code> <code>{"{horario}"}</code>{" "}
          <code>{"{concesionaria}"}</code>
        </p>

        {intents.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Todavía no hay preguntas cargadas. Empezá con las 8 base y editalas.
          </Card>
        ) : (
          intents.map((i) => (
            <IntentCard key={i.id} intent={i} pending={pending} start={start} />
          ))
        )}
      </section>
    </div>
  );
}

function BranchCard({
  initial,
  pending,
  start,
}: {
  initial: BotBranchConfig;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const [c, setC] = useState(initial);
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);

  function patch(p: Partial<BotBranchConfig>) {
    setC((prev) => ({ ...prev, ...p }));
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              c.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            <Bot className="size-4" />
          </span>
          <div>
            <p className="font-semibold">{c.branchName}</p>
            <p className="max-w-xl text-xs text-muted-foreground">{summarize(c)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`en-${c.branchId}`} className="text-xs">
            {c.enabled ? "Encendido" : "Apagado"}
          </Label>
          <Switch
            id={`en-${c.branchId}`}
            checked={c.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
          />
        </div>
      </div>

      {c.enabled && (
        <>
          <div className="h-px bg-border" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Modo</Label>
              <Select
                value={c.mode}
                onValueChange={(v) => patch({ mode: v as "draft" | "auto" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">
                    Borrador — sugiere, el asesor manda
                  </SelectItem>
                  <SelectItem value="auto">Automático — responde solo</SelectItem>
                </SelectContent>
              </Select>
              {c.mode === "auto" && (
                <p className="text-[11px] text-warning-text">
                  En automático el cliente recibe el mensaje sin que nadie lo
                  revise. Conviene usar borrador unas semanas primero.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Tope de respuestas por conversación
              </Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={c.maxTurns}
                onChange={(e) => patch({ maxTurns: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Después se calla y espera al asesor.
              </p>
            </div>

            <label className="flex items-start gap-2.5">
              <Switch
                checked={c.outsideHours}
                onCheckedChange={(v) => patch({ outsideHours: v })}
              />
              <span className="text-xs">
                <span className="font-semibold">Fuera de horario</span>
                <span className="block text-muted-foreground">
                  Responder cuando la sucursal está cerrada.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5">
              <Switch
                checked={c.whenNobodyActive}
                onCheckedChange={(v) => patch({ whenNobodyActive: v })}
              />
              <span className="text-xs">
                <span className="font-semibold">Sin asesores activos</span>
                <span className="block text-muted-foreground">
                  Responder si nadie está recibiendo conversaciones.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">
                En horario, si nadie contesta en…
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  placeholder="Nunca"
                  value={c.idleTriggerMinutes ?? ""}
                  onChange={(e) =>
                    patch({
                      idleTriggerMinutes: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">
                  minutos. Vacío = no interviene en horario.
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cubre el caso de un asesor activo pero con 15 conversaciones
                abiertas: está activo y el cliente espera igual.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Se presenta como</Label>
              <Input
                placeholder="Asistente de la concesionaria"
                value={c.greetingName ?? ""}
                onChange={(e) => patch({ greetingName: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Siempre aclara que es una respuesta automática (lo pide Meta).
              </p>
            </div>

            <label className="flex items-start gap-2.5">
              <Switch
                checked={c.qualify}
                onCheckedChange={(v) => patch({ qualify: v })}
              />
              <span className="text-xs">
                <span className="font-semibold">Calificar mientras espera</span>
                <span className="block text-muted-foreground">
                  Pregunta modelo, usado y forma de pago. El asesor entra con el
                  lead ya cargado.
                </span>
              </span>
            </label>
          </div>
        </>
      )}

      {dirty && (
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setC(initial)}>
            Descartar
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveBotConfig({ ...c });
                if (!res.ok) toast.error(res.message);
                else toast.success(`Configuración de ${c.branchName} guardada`);
              })
            }
          >
            Guardar
          </Button>
        </div>
      )}
    </Card>
  );
}

function IntentCard({
  intent,
  pending,
  start,
}: {
  intent: BotIntentRow;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(intent.label);
  const [reply, setReply] = useState(intent.reply);
  const [keywords, setKeywords] = useState(intent.keywords.join(", "));
  const [enabled, setEnabled] = useState(intent.enabled);

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {label}
            {intent.slug === "precio" && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                nunca da un número
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Detecta: {keywords || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              start(async () => {
                const res = await saveBotIntent({
                  id: intent.id,
                  label,
                  reply,
                  keywords,
                  enabled: v,
                });
                if (!res.ok) toast.error(res.message);
              });
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((e) => !e)}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8"
            placeholder="Nombre de la pregunta"
          />
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="h-8"
            placeholder="palabras clave, separadas por coma"
          />
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="La respuesta, tal cual la va a mandar"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await saveBotIntent({
                    id: intent.id,
                    label,
                    reply,
                    keywords,
                    enabled,
                  });
                  if (!res.ok) toast.error(res.message);
                  else {
                    toast.success("Respuesta guardada");
                    setEditing(false);
                  }
                })
              }
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap">
          {reply}
        </p>
      )}
    </Card>
  );
}

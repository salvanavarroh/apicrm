"use client";

import { AlertTriangle, Bot, Info, Pencil, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VariablesCard } from "@/app/(app)/admin/bot/variables-card";
import { BOT_VARS, fillVars } from "@/lib/bot/variables";
import { HARD_BLOCKLIST } from "@/lib/bot/base-intents";
import { cn } from "@/lib/utils";

import {
  createIntentFromQuestion,
  saveBotConfig,
  saveBotIntent,
  seedBaseIntents,
  type BotBranchConfig,
  type BotIntentRow,
  type BranchVars,
  type UnknownQuestion,
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
  branchVars,
  unknown,
}: {
  configs: BotBranchConfig[];
  intents: BotIntentRow[];
  /** Variables por sucursal, para las vistas previas. */
  branchVars: BranchVars[];
  unknown: UnknownQuestion[];
}) {
  const [pending, start] = useTransition();
  // Para las vistas previas alcanza una sucursal de ejemplo: lo que importa es
  // que el admin vea la respuesta resuelta en vez del template con llaves.
  const previewVars = branchVars[0]?.values ?? {};

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
      {/* Las variables, antes de las preguntas: es lo que explica por qué no hay
          que escribir el horario ni la dirección en cada respuesta. */}
      <VariablesCard branches={branchVars} />

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
            <IntentCard
              key={i.id}
              intent={i}
              pending={pending}
              start={start}
              vars={previewVars}
            />
          ))
        )}
      </section>

      {/* Bucle de mejora: lo que el bot no supo contestar se convierte en una
          pregunta frecuente con un clic. Sin IA generativa. */}
      {unknown.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              No supo contestar ({unknown.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Lo que le preguntaron y no matcheó con ninguna respuesta. Convertilas
              en preguntas frecuentes y el bot mejora solo.
            </p>
          </div>
          {unknown.map((q) => (
            <UnknownCard key={q.text} q={q} pending={pending} start={start} />
          ))}
        </section>
      )}
    </div>
  );
}

function UnknownCard({
  q,
  pending,
  start,
}: {
  q: UnknownQuestion;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [reply, setReply] = useState("");
  // Se proponen las palabras del mensaje como punto de partida: es lo que el
  // cliente escribió de verdad, mejor que adivinar sinónimos.
  const [keywords, setKeywords] = useState(
    q.text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 4)
      .join(", "),
  );

  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm">“{q.text}”</p>
          <p className="text-[11px] text-muted-foreground">
            {q.count} {q.count === 1 ? "vez" : "veces"} · última{" "}
            {new Date(q.lastAt).toLocaleDateString("es-AR")}
          </p>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Crear respuesta
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t pt-2">
          <Input
            className="h-8"
            placeholder="Nombre de la pregunta (ej: Aceptan tarjeta)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            className="h-8"
            placeholder="palabras clave, separadas por coma"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="Qué querés que responda. Sin precios."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={pending || !label.trim() || !reply.trim()}
              onClick={() =>
                start(async () => {
                  const res = await createIntentFromQuestion({
                    label,
                    keywords,
                    reply,
                  });
                  if (!res.ok) toast.error(res.message);
                  else {
                    toast.success("Pregunta agregada");
                    setOpen(false);
                  }
                })
              }
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
    </Card>
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
            {/* El modo era un select chico rotulado "Modo" y no se encontraba:
                el usuario no sabía cómo hacer que respondiera solo. Ahora son dos
                opciones explícitas, con el nombre de lo que hacen. */}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">
                ¿Qué hace el bot cuando le escriben?
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => patch({ mode: "draft" })}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    c.mode === "draft"
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-semibold">Sólo sugerir</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Escribe la respuesta y te la deja en el inbox. La manda el
                    asesor con un clic. Al cliente no le llega nada sin revisar.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => patch({ mode: "auto" })}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    c.mode === "auto"
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-semibold">Responder solo</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Le contesta al cliente directamente, sin que nadie revise.
                    Sigue el tope de respuestas y se apaga si contesta un humano.
                  </p>
                </button>
              </div>
              {c.mode === "auto" && (
                <p className="text-[11px] text-warning-text">
                  En automático el cliente recibe el mensaje sin que nadie lo
                  revise. Conviene usar &quot;sólo sugerir&quot; unas semanas primero.
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

            {/* Responder fuera de la lista. Es la diferencia entre un bot que
                sólo entiende "hola" y uno que entiende la pregunta. */}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="flex items-start gap-2.5">
                <Switch
                  checked={c.freeAnswer}
                  onCheckedChange={(v) => patch({ freeAnswer: v })}
                />
                <span className="text-xs">
                  <span className="font-semibold">
                    Responder preguntas que no están en la lista
                  </span>
                  <span className="block text-muted-foreground">
                    Si el cliente pregunta algo que no matchea ninguna pregunta
                    frecuente, el bot contesta igual — pero SÓLO con lo que sabe:
                    las respuestas de acá y la información de abajo. Lo que no
                    está, dice que no lo sabe y deriva. Nunca habla de plata.
                  </span>
                </span>
              </label>

              {c.freeAnswer && (
                <div className="flex flex-col gap-1.5 pl-11">
                  <Label className="text-xs font-semibold">
                    Qué sabe el bot de esta concesionaria
                  </Label>
                  <Textarea
                    rows={5}
                    value={c.knowledge ?? ""}
                    onChange={(e) => patch({ knowledge: e.target.value })}
                    placeholder={
                      "Marcas que trabajamos: Toyota, Nissan.\n" +
                      "Tenemos 3 sucursales: Lanús, Quilmes y Cañuelas.\n" +
                      "Hacemos service oficial con turno previo.\n" +
                      "Aceptamos usados de cualquier marca en parte de pago."
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Esta es su única fuente además de las preguntas frecuentes.
                    Todo lo que no esté acá, el bot no lo sabe — y eso es a
                    propósito: es lo que hace que no invente.
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Label className="text-xs">Largo máximo de la respuesta</Label>
                    <Input
                      type="number"
                      min={100}
                      max={1000}
                      step={50}
                      value={c.maxAnswerChars}
                      onChange={(e) =>
                        patch({ maxAnswerChars: Number(e.target.value) })
                      }
                      className="h-8 w-24"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      caracteres. Una respuesta larga es la señal de que se fue
                      por las ramas.
                    </span>
                  </div>
                </div>
              )}
            </div>
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
  vars,
}: {
  intent: BotIntentRow;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
  /** Valores reales de las variables, para la vista previa. */
  vars: Record<string, string>;
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
          <VarHelp reply={reply} onInsert={(v) => setReply(`${reply} {${v}}`)} />
          <Preview reply={reply} vars={vars} />
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
        // Se muestra RESUELTA, no el template: es lo que va a recibir el cliente.
        // Ver el `{horario}` crudo era lo que hacía pensar que había que
        // completarlo a mano en cada respuesta.
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap">
          {fillVars(reply, vars)}
        </p>
      )}
    </Card>
  );
}

/** Chips para insertar una variable sin tener que recordar cómo se escribe. */
function VarHelp({
  reply,
  onInsert,
}: {
  reply: string;
  onInsert: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted-foreground">Insertar:</span>
      {BOT_VARS.map((v) => {
        const used = reply.includes(`{${v.key}}`);
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => onInsert(v.key)}
            title={v.source}
            className={cn(
              "rounded-full border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
              used
                ? "border-accent/40 bg-accent/10 text-accent"
                : "hover:bg-muted",
            )}
          >
            {`{${v.key}}`}
          </button>
        );
      })}
    </div>
  );
}

/** Cómo se va a leer del otro lado, con los datos de verdad. */
function Preview({
  reply,
  vars,
}: {
  reply: string;
  vars: Record<string, string>;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-2">
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Así lo recibe el cliente
      </p>
      <p className="text-xs whitespace-pre-wrap">{fillVars(reply, vars)}</p>
    </div>
  );
}

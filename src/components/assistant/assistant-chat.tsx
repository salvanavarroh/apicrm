"use client";

// ============================================================================
// El chat del asistente. Se usa en dos lados con el mismo componente:
// el widget flotante (`variant="panel"`) y la página de Ayuda (`variant="page"`).
//
// Dos detalles que no son cosméticos:
//
//  · MANDA EL PATHNAME. Preguntar "¿cómo hago esto?" parado en la ficha de un
//    lead tiene que dar una respuesta distinta que preguntarlo en Reportes. Es
//    contexto gratis y sube mucho la calidad.
//
//  · MUESTRA LAS FUENTES. Que el usuario pueda ver de dónde salió la respuesta
//    es lo que separa una herramienta de un oráculo, y es lo que permite que un
//    gerente diga "esto está mal" señalando algo concreto.
// ============================================================================

import { ArrowUp, Bug, Loader2, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { RichText } from "@/components/assistant/rich-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Source = { articleId: string; slug: string; title: string; summary: string | null };
type ToolLink = { href: string; label: string };

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  links?: ToolLink[];
  cached?: boolean;
  /** Id en la base, para poder mandar el 👍/👎. */
  serverId?: string | null;
  feedback?: 1 | -1 | null;
  streaming?: boolean;
  /** Ruta que eligió el ruteador. Si es "soporte", se ofrece reportar. */
  route?: string | null;
};

export type Suggestion = { label: string; question: string };

/** Clave del hilo activo en el navegador. Sólo el id: el contenido va en la base. */
export const THREAD_KEY = "api-crm.assistant.thread";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  route: string | null;
  feedback: number | null;
};

export function AssistantChat({
  suggestions,
  variant = "panel",
  greeting,
  onReport,
  initialThreadId,
  onThreadChange,
}: {
  suggestions: Suggestion[];
  variant?: "panel" | "page";
  greeting: string;
  /**
   * Qué conversación abrir:
   *   `undefined` → la última que se estaba usando (se recuerda en el navegador)
   *   `null`      → una nueva, en blanco
   *   un id       → esa
   */
  initialThreadId?: string | null;
  /** Avisa qué conversación quedó abierta, para que el panel la pueda marcar. */
  onThreadChange?: (id: string | null) => void;
  /**
   * Abre el formulario de reporte. Se le pasa el hilo y lo último que preguntó
   * el usuario, para que no tenga que volver a escribirlo.
   */
  onReport?: (ctx: { threadId: string | null; question: string }) => void;
}) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(
    initialThreadId ?? null,
  );
  const [restoring, setRestoring] = useState(initialThreadId !== null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // En una ref para que el efecto de restauración no dependa de la identidad de
  // la función: si dependiera, cada render del padre volvería a pedir el hilo.
  const onThreadChangeRef = useRef(onThreadChange);
  onThreadChangeRef.current = onThreadChange;
  const mensajesRef = useRef<Msg[]>([]);
  mensajesRef.current = messages;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // -------------------------------------------------------------------------
  // Restaurar la conversación.
  //
  // Los mensajes siempre se guardaron en la base; lo que faltaba era volver a
  // leerlos. El id del hilo activo se recuerda en `localStorage` —es una
  // preferencia de este navegador, no un dato— y el contenido sale de Postgres,
  // que es donde tiene que estar: así la charla sobrevive al refresh, a cerrar
  // el panel y a cambiar de pantalla.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelado = false;

    async function restaurar() {
      let id = initialThreadId ?? null;
      if (initialThreadId === undefined) {
        try {
          id = window.localStorage.getItem(THREAD_KEY);
        } catch {
          id = null; // modo incógnito o storage bloqueado: arranca en blanco
        }
      }
      if (!id) {
        setRestoring(false);
        return;
      }

      try {
        const res = await fetch(`/api/assistant/threads?id=${encodeURIComponent(id)}`);
        if (!res.ok) {
          // El hilo ya no existe: se olvida en vez de dejar una referencia rota.
          forgetThread();
          return;
        }
        const data = (await res.json()) as { messages: StoredMessage[] };
        if (cancelado) return;
        // Si mientras se restauraba el usuario ya empezó a hablar, no se pisa:
        // lo que está en pantalla es más nuevo que lo que trajo la consulta.
        if (mensajesRef.current.length > 0) {
          setRestoring(false);
          return;
        }
        setThreadId(id);
        onThreadChangeRef.current?.(id);
        setMessages(
          data.messages.map((m, i) => ({
            id: `r${i}`,
            role: m.role,
            text: m.content,
            route: m.route,
            serverId: m.role === "assistant" ? m.id : null,
            feedback: m.feedback === 1 || m.feedback === -1 ? m.feedback : null,
          })),
        );
      } catch {
        // Sin conexión: mejor un chat vacío que un error en la cara.
      } finally {
        if (!cancelado) setRestoring(false);
      }
    }

    void restaurar();
    return () => {
      cancelado = true;
    };
  }, [initialThreadId]);

  /** Recuerda el hilo activo para el próximo refresh. */
  function rememberThread(id: string) {
    setThreadId(id);
    onThreadChangeRef.current?.(id);
    try {
      window.localStorage.setItem(THREAD_KEY, id);
    } catch {
      /* storage bloqueado: la conversación sigue en la base igual */
    }
  }

  function forgetThread() {
    setThreadId(null);
    setRestoring(false);
    try {
      window.localStorage.removeItem(THREAD_KEY);
    } catch {
      /* idem */
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q };
    const botId = `a${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: botId, role: "assistant", text: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);

    const history = messages.slice(-4).map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, route: pathname, threadId, history }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Falló la consulta." }));
        patch(botId, {
          text: err.error ?? "No pude contestarte ahora. Probá de nuevo.",
          streaming: false,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 2);
          if (!raw.startsWith("data:")) continue;
          const payload = raw.slice(5).trim();
          if (payload === "[DONE]") continue;

          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (ev.type === "thread" && typeof ev.id === "string") {
            rememberThread(ev.id);
          }
          if (ev.type === "message" && typeof ev.id === "string") {
            patch(botId, { serverId: ev.id });
          }
          if (ev.type === "meta") {
            patch(botId, {
              sources: (ev.sources as Source[]) ?? [],
              links: (ev.links as ToolLink[]) ?? [],
              cached: Boolean(ev.cached),
              route: typeof ev.route === "string" ? ev.route : null,
            });
          }
          if (ev.type === "delta" && typeof ev.text === "string") {
            acc += ev.text;
            patch(botId, { text: acc });
          }
          if (ev.type === "replace" && typeof ev.text === "string") {
            acc = ev.text;
            patch(botId, { text: acc });
          }
          if (ev.type === "error" && typeof ev.message === "string") {
            acc = acc || "No pude contestarte ahora. Probá de nuevo.";
            patch(botId, { text: acc });
          }
        }
      }
      patch(botId, { streaming: false });
    } catch {
      patch(botId, {
        text: "Se cortó la conexión. Probá de nuevo.",
        streaming: false,
      });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function patch(id: string, data: Partial<Msg>) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...data } : x)));
  }

  async function sendFeedback(msg: Msg, value: 1 | -1) {
    if (!msg.serverId || msg.feedback === value) return;
    patch(msg.id, { feedback: value });
    await fetch("/api/assistant/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.serverId, value }),
    }).catch(() => undefined);
  }

  const empty = messages.length === 0 && !restoring;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        variant === "page" && "rounded-lg border bg-card",
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex flex-col gap-4 overflow-y-auto p-4",
          // En el panel flotante el alto lo fija el contenedor, así que la lista
          // lo llena. En la página NO puede tener alto fijo: con la conversación
          // vacía dejaba 400px en blanco entre las sugerencias y el campo de
          // texto, y así no se lee como un chat — la vista se iba a las tarjetas
          // de abajo. Acá el alto lo pone el contenido y sólo scrollea al pasar
          // el tope.
          variant === "panel"
            ? "min-h-0 flex-1"
            : "max-h-[26rem] min-h-[7rem]",
        )}
      >
        {empty && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{greeting}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.question}
                  type="button"
                  onClick={() => ask(s.question)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {s.label}
                </button>
              ))}
              {onReport && (
                <button
                  type="button"
                  onClick={() => onReport({ threadId, question: "" })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <Bug className="size-3.5" /> Reportar un problema
                </button>
              )}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-foreground">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-2">
              <div className="max-w-[95%] text-sm leading-relaxed">
                {m.text ? (
                  <RichText text={m.text} />
                ) : (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Pensando…
                  </span>
                )}
              </div>

              {(m.links?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {m.links!.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                    >
                      {l.label} →
                    </Link>
                  ))}
                </div>
              )}

              {m.route === "soporte" && onReport && !m.streaming && (
                <button
                  type="button"
                  onClick={() =>
                    onReport({
                      threadId,
                      question:
                        [...messages].reverse().find((x) => x.role === "user")
                          ?.text ?? "",
                    })
                  }
                  className="inline-flex w-fit items-center gap-1.5 rounded-md border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                >
                  <Bug className="size-3.5" /> Reportar este problema
                </button>
              )}

              {(m.sources?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-1 border-l-2 border-border pl-2">
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Según
                  </span>
                  {m.sources!.map((s) => (
                    <span key={s.articleId} className="text-xs text-muted-foreground">
                      {s.title}
                    </span>
                  ))}
                </div>
              )}

              {!m.streaming && m.serverId && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Respuesta útil"
                    onClick={() => sendFeedback(m, 1)}
                    className={cn(
                      "rounded p-1 text-muted-foreground transition-colors hover:text-success",
                      m.feedback === 1 && "text-success",
                    )}
                  >
                    <ThumbsUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Respuesta no útil"
                    onClick={() => sendFeedback(m, -1)}
                    className={cn(
                      "rounded p-1 text-muted-foreground transition-colors hover:text-destructive",
                      m.feedback === -1 && "text-destructive",
                    )}
                  >
                    <ThumbsDown className="size-3.5" />
                  </button>
                  {m.cached && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      respuesta guardada
                    </span>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex items-end gap-2 border-t p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace salto de línea: es lo que espera
            // cualquiera que haya usado un chat.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={1}
          maxLength={600}
          placeholder="Preguntame algo del CRM…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Empezar de nuevo"
            onClick={() => {
              setMessages([]);
              setThreadId(null);
            }}
          >
            <RotateCcw />
          </Button>
        )}
        <Button type="submit" size="icon-sm" disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}

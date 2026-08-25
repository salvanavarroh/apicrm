// ============================================================================
// Único punto de llamada al modelo de texto.
//
// Hasta ahora cada feature de IA (`lead-mapper`, `price-mapper`, `bot/classify`,
// `bot/answer`) armaba su propio `fetch` a la API de OpenAI. Cuatro copias del
// mismo bloque, cuatro timeouts distintos y ningún lugar donde cambiar de modelo.
//
// Este helper centraliza eso para lo nuevo. No migra a los que ya existen (no es
// el momento de tocar el bot del inbox), pero es el que tiene que usar todo lo
// que se escriba de acá en adelante: cambiar de modelo, de proveedor o de
// política de reintentos es editar este archivo.
//
// Server-only: usa OPENAI_API_KEY.
// ============================================================================

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** El mismo que ya usa el repo. Se cambia acá y en ningún otro lado. */
export const CHAT_MODEL = "gpt-4.1-mini";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompleteOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Milisegundos. Por default 12s: si tarda más, algo está mal. */
  timeoutMs?: number;
  model?: string;
};

export type CompleteResult =
  | { ok: true; text: string; tokensIn: number; tokensOut: number }
  | { ok: false; reason: string };

function apiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

/** Llamada sincrónica. Para clasificar, resumir, cosas cortas. */
export async function complete(
  opts: CompleteOptions,
): Promise<CompleteResult> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "sin OPENAI_API_KEY" };

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? CHAT_MODEL,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 400,
        messages: opts.messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, reason: "respuesta vacía" };
    return {
      ok: true,
      text,
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error llamando al modelo",
    };
  }
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; tokensOut: number }
  | { type: "error"; reason: string };

/**
 * Llamada en streaming.
 *
 * Devuelve un generador de deltas. El asistente lo necesita porque el número que
 * el usuario percibe no es el total sino el PRIMER TOKEN: 600 ms hasta la
 * primera letra se siente instantáneo aunque la respuesta entera tarde tres
 * segundos.
 */
export async function* completeStream(
  opts: CompleteOptions,
): AsyncGenerator<StreamEvent> {
  const key = apiKey();
  if (!key) {
    yield { type: "error", reason: "sin OPENAI_API_KEY" };
    return;
  }

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? CHAT_MODEL,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 400,
        messages: opts.messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      cache: "no-store",
    });
  } catch (e) {
    yield {
      type: "error",
      reason: e instanceof Error ? e.message : "error de red",
    };
    return;
  }

  if (!res.ok || !res.body) {
    yield { type: "error", reason: `HTTP ${res.status}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let tokensOut = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE: eventos separados por línea en blanco, campos "data: ...".
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { completion_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield { type: "delta", text: delta };
          }
          if (chunk.usage?.completion_tokens) {
            tokensOut = chunk.usage.completion_tokens;
          }
        } catch {
          // Un chunk mal formado no puede tumbar el stream entero.
        }
      }
    }
  } catch (e) {
    yield {
      type: "error",
      reason: e instanceof Error ? e.message : "stream interrumpido",
    };
    return;
  }

  yield { type: "done", text: full, tokensOut };
}

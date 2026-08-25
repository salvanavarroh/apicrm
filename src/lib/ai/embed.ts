// ============================================================================
// Embeddings.
//
// `text-embedding-3-small`, 1536 dimensiones. Por qué éste:
//   · Multilingüe suficiente para castellano rioplatense con jerga de
//     concesionaria (el corpus es chico y la búsqueda es híbrida: el índice de
//     texto cubre lo que el vector aproxima mal).
//   · US$ 0,02 por millón de tokens. Indexar toda la documentación cuesta
//     centavos, y reindexar es incremental por hash.
//   · 1536 dims × 4 bytes = 6 KB por vector. Con ~3.000 fragmentos son ~25 MB
//     con índice incluido: nada para Postgres.
//
// Server-only: usa OPENAI_API_KEY.
// ============================================================================

const OPENAI_URL = "https://api.openai.com/v1/embeddings";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMS = 1536;

/** Tope de la API por request. Se batchea sin pensar en el llamador. */
const BATCH_SIZE = 96;
const MAX_RETRIES = 3;

export type EmbedResult =
  | { ok: true; vectors: number[][]; tokens: number }
  | { ok: false; reason: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatch(
  key: string,
  inputs: string[],
): Promise<EmbedResult> {
  let lastReason = "sin intentos";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });

      if (res.status === 429 || res.status >= 500) {
        // Rate limit o error del proveedor: reintento con espera creciente.
        lastReason = `HTTP ${res.status}`;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

      const json = (await res.json()) as {
        data?: { embedding: number[]; index: number }[];
        usage?: { total_tokens?: number };
      };
      const data = json.data ?? [];
      if (data.length !== inputs.length) {
        return { ok: false, reason: "cantidad de vectores inesperada" };
      }
      // La API no garantiza el orden: se reordena por `index`.
      const vectors: number[][] = new Array(inputs.length);
      for (const d of data) vectors[d.index] = d.embedding;
      return { ok: true, vectors, tokens: json.usage?.total_tokens ?? 0 };
    } catch (e) {
      lastReason = e instanceof Error ? e.message : "error de red";
      await sleep(500 * 2 ** attempt);
    }
  }

  return { ok: false, reason: lastReason };
}

/** Embebe N textos. Batchea y reintenta solo. */
export async function embed(texts: string[]): Promise<EmbedResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, reason: "sin OPENAI_API_KEY" };
  if (texts.length === 0) return { ok: true, vectors: [], tokens: 0 };

  const vectors: number[][] = [];
  let tokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await embedBatch(key, batch);
    if (!res.ok) return res;
    vectors.push(...res.vectors);
    tokens += res.tokens;
  }

  return { ok: true, vectors, tokens };
}

/** Atajo para un solo texto. */
export async function embedOne(
  text: string,
): Promise<{ ok: true; vector: number[] } | { ok: false; reason: string }> {
  const res = await embed([text]);
  if (!res.ok) return res;
  const vector = res.vectors[0];
  if (!vector) return { ok: false, reason: "sin vector" };
  return { ok: true, vector };
}

/**
 * Formato de texto de pgvector: "[0.1,0.2,…]".
 *
 * supabase-js no tiene un tipo `vector`, así que el vector viaja como string en
 * los argumentos del `.rpc()`. Postgres lo castea al recibirlo.
 */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// ============================================================================
// PriceMapper — capa agnóstica de proveedor que mapea columnas de un archivo a
// campos de la lista de precios usando IA. Hoy: OpenAI (structured outputs).
// Server-only: usa OPENAI_API_KEY. Espejo de lead-mapper.ts.
// ============================================================================

import { getServerEnv } from "@/lib/env";
import {
  PRICE_SPECIAL_TARGETS,
  PRICE_TARGET_FIELDS,
  isKnownPriceTarget,
  type PriceColumnMapping,
  type PriceMapping,
} from "@/lib/price-import";

export type PriceMapInput = {
  headers: string[];
  sample: Record<string, string>[]; // muestra de filas (~30)
  /** Instrucción opcional en lenguaje natural para regenerar el mapeo. */
  instruction?: string;
};

export interface PriceMapper {
  map(input: PriceMapInput): Promise<PriceMapping>;
}

const ALL_TARGETS = [
  ...PRICE_TARGET_FIELDS.map((f) => f.key),
  ...PRICE_SPECIAL_TARGETS,
];

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-mini";

function buildSystemPrompt(): string {
  const catalog = PRICE_TARGET_FIELDS.map(
    (f) => `- ${f.key} (${f.label}): ${f.hint}`,
  ).join("\n");
  return [
    "Sos un asistente que mapea columnas de un archivo (CSV/Excel) con una LISTA",
    "DE PRECIOS de vehículos de un concesionario a los campos de nuestro CRM.",
    "",
    "Para CADA columna del archivo devolvés a qué campo destino corresponde.",
    "El NOMBRE de la columna es la señal MÁS FUERTE: si se llama igual o muy",
    "parecido a un campo destino, mapealo a ese campo salvo que los valores de",
    "ejemplo lo contradigan claramente. Recién si el nombre no ayuda, mirá los",
    "valores.",
    "",
    "Campos destino disponibles:",
    catalog,
    "",
    "Destino especial:",
    "- ignore: columnas inútiles para la lista de precios (vacías, separadores,",
    "  totales, columnas de control).",
    "",
    "Pistas de mapeo frecuentes:",
    "- marca/brand/fabricante → brand.",
    "- modelo/model → model. version/versión/terminación → version.",
    "- año/year/model_year → model_year.",
    "- precio/price/list_price/precio_lista/valor → list_price (el NÚMERO).",
    "- moneda/currency (ARS, USD, $, U$S) → currency.",
    "- tipo/product_type/condicion (0km, usado) → product_type.",
    "- notas/observaciones/detalle/comentarios → notes.",
    "",
    "Reglas:",
    "- Cada columna del archivo aparece EXACTAMENTE una vez en la respuesta,",
    "  con su nombre EXACTO en 'source'.",
    "- confidence entre 0 y 1 (qué tan seguro estás del mapeo).",
    "- note: aclaración breve en español (o cadena vacía).",
    "- brand, model y list_price son los campos clave: identificarlos bien es lo",
    "  más importante. Si dudás, preferí no perder datos.",
  ].join("\n");
}

function buildUserPrompt(input: PriceMapInput): string {
  const lines = [
    `Columnas del archivo: ${JSON.stringify(input.headers)}`,
    "",
    "Muestra de filas (JSON):",
    JSON.stringify(input.sample.slice(0, 30), null, 2),
  ];
  if (input.instruction?.trim()) {
    lines.push(
      "",
      "Instrucción adicional del usuario (tiene prioridad, respetala):",
      input.instruction.trim(),
    );
  }
  return lines.join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          target: { type: "string", enum: ALL_TARGETS },
          confidence: { type: "number" },
          note: { type: "string" },
        },
        required: ["source", "target", "confidence", "note"],
      },
    },
    notes: { type: "string" },
  },
  required: ["columns", "notes"],
} as const;

/** Normaliza/valida la salida de la IA contra los headers reales del archivo. */
function reconcile(headers: string[], mapping: PriceMapping): PriceMapping {
  const bySource = new Map<string, PriceColumnMapping>();
  for (const col of mapping.columns) {
    if (!col?.source) continue;
    bySource.set(col.source, col);
  }
  const columns: PriceColumnMapping[] = headers.map((h) => {
    const found = bySource.get(h);
    if (found && isKnownPriceTarget(found.target)) {
      return {
        source: h,
        target: found.target,
        confidence:
          typeof found.confidence === "number"
            ? Math.max(0, Math.min(1, found.confidence))
            : 0.5,
        note: found.note ?? "",
      };
    }
    // La IA no lo mapeó o devolvió un destino inválido → ignore por defecto.
    return { source: h, target: "ignore", confidence: 0, note: "Sin mapear" };
  });
  return { columns, notes: mapping.notes ?? "" };
}

export function createOpenAiPriceMapper(): PriceMapper {
  return {
    async map(input) {
      const { OPENAI_API_KEY } = getServerEnv();
      if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY no está configurada");
      }

      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "price_column_mapping",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI respondió ${res.status}: ${detail.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI no devolvió contenido");

      let parsed: PriceMapping;
      try {
        parsed = JSON.parse(content) as PriceMapping;
      } catch {
        throw new Error("No pude parsear la respuesta de OpenAI");
      }

      return reconcile(input.headers, parsed);
    },
  };
}

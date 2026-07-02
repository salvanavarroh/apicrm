// ============================================================================
// LeadMapper — capa agnóstica de proveedor que mapea columnas de un archivo a
// campos de `leads` usando IA. Hoy: OpenAI (structured outputs, json_schema).
// Server-only: usa OPENAI_API_KEY. Ver docs/carga-leads-ia.md.
// ============================================================================

import { getServerEnv } from "@/lib/env";
import {
  SPECIAL_TARGETS,
  TARGET_FIELDS,
  isKnownTarget,
  type ColumnMapping,
  type LeadMapping,
} from "@/lib/lead-import";

export type MapInput = {
  headers: string[];
  sample: Record<string, string>[]; // muestra de filas (~30)
  /** Instrucción opcional en lenguaje natural para regenerar el mapeo. */
  instruction?: string;
};

export interface LeadMapper {
  map(input: MapInput): Promise<LeadMapping>;
}

const ALL_TARGETS = [
  ...TARGET_FIELDS.map((f) => f.key),
  ...SPECIAL_TARGETS,
];

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-mini";

function buildSystemPrompt(): string {
  const catalog = TARGET_FIELDS.map(
    (f) => `- ${f.key} (${f.label}): ${f.hint}`,
  ).join("\n");
  return [
    "Sos un asistente que mapea columnas de un archivo (CSV/Excel) de leads de",
    "un concesionario de autos a los campos de nuestro CRM.",
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
    "Destinos especiales:",
    "- full_name: una sola columna con nombre y apellido juntos (ej. columna",
    "  'full_name', 'nombre', 'nombre y apellido', 'cliente').",
    "- metadata: columnas estructuradas útiles pero sin campo propio (ids de",
    "  anuncio/campaña/formulario de la fuente, flags como is_organic, etc.). NO",
    "  uses metadata para texto humano libre: eso va a initial_notes.",
    "- ignore: columnas realmente inútiles (vacías, separadores).",
    "",
    "Mapeos frecuentes de exports de Meta Lead Ads (guía, no obligatoria):",
    "- full_name→full_name, phone_number→phone, email→email.",
    "- modelo/vehiculo→vehicle_model, consulta/mensaje/comentario→initial_notes.",
    "- province→province, city/ciudad→city, horario_de_contacto→preferred_contact_time.",
    "- platform→utm_source, campaign_name→utm_campaign, ad_name→utm_content,",
    "  adset_name→utm_term.",
    "- id (id del lead en la fuente)→external_id, created_time→source_created_at.",
    "- ad_id, adset_id, campaign_id, form_id, form_name, is_organic,",
    "  retailer_item_id→metadata.",
    "- ¡Ojo! ad_name/adset_name/campaign_name son nombres de anuncio/campaña, NO",
    "  el nombre de la persona: NUNCA los mapees a full_name/first_name.",
    "",
    "Reglas:",
    "- Cada columna del archivo aparece EXACTAMENTE una vez en la respuesta,",
    "  con su nombre EXACTO en 'source'.",
    "- confidence entre 0 y 1 (qué tan seguro estás del mapeo).",
    "- note: aclaración breve en español (o cadena vacía).",
    "- Si dudás entre un campo y metadata/ignore, preferí no perder datos.",
  ].join("\n");
}

function buildUserPrompt(input: MapInput): string {
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
function reconcile(headers: string[], mapping: LeadMapping): LeadMapping {
  const bySource = new Map<string, ColumnMapping>();
  for (const col of mapping.columns) {
    if (!col?.source) continue;
    bySource.set(col.source, col);
  }
  const columns: ColumnMapping[] = headers.map((h) => {
    const found = bySource.get(h);
    if (found && isKnownTarget(found.target)) {
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
    // La IA no lo mapeó o devolvió un destino inválido → metadata por defecto.
    return { source: h, target: "metadata", confidence: 0, note: "Sin mapear" };
  });
  return { columns, notes: mapping.notes ?? "" };
}

export function createOpenAiMapper(): LeadMapper {
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
              name: "lead_column_mapping",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `OpenAI respondió ${res.status}: ${detail.slice(0, 300)}`,
        );
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI no devolvió contenido");

      let parsed: LeadMapping;
      try {
        parsed = JSON.parse(content) as LeadMapping;
      } catch {
        throw new Error("No pude parsear la respuesta de OpenAI");
      }

      return reconcile(input.headers, parsed);
    },
  };
}

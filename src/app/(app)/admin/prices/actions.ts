"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  applyPriceMapping,
  type PriceMappedRow,
  type PriceMapping,
  type PriceMappingStats,
  type PriceRowData,
} from "@/lib/price-import";
import { createOpenAiPriceMapper } from "@/lib/price-mapper";
import { sampleRows } from "@/lib/lead-import-parse";
import { createClient } from "@/lib/supabase/server";

const priceSchema = z.object({
  product_type_id: z.string().uuid().optional().or(z.literal("")),
  brand: z.string().min(1, "Marca obligatoria"),
  model: z.string().min(1, "Modelo obligatorio"),
  version: z.string().optional().or(z.literal("")),
  model_year: z.string().optional().or(z.literal("")),
  currency: z.string().min(2).max(5).default("ARS"),
  list_price: z.coerce.number().nonnegative("Precio inválido"),
  notes: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type PriceInput = z.input<typeof priceSchema>;

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

function revalidatePrices() {
  revalidatePath("/admin/prices");
  revalidatePath("/sales");
  revalidatePath("/manager");
}

export async function createPrice(
  input: PriceInput,
): Promise<Result<{ id: string }>> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id)
    return { ok: false, message: "No tenés empresa asignada" };

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prices")
    .insert({
      company_id: profile.company_id,
      product_type_id: parsed.data.product_type_id || null,
      brand: parsed.data.brand.trim(),
      model: parsed.data.model.trim(),
      version: parsed.data.version || null,
      model_year: parsed.data.model_year || null,
      currency: parsed.data.currency,
      list_price: Number(parsed.data.list_price),
      notes: parsed.data.notes || null,
      status: parsed.data.status,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }
  revalidatePrices();
  return { ok: true, id: data.id };
}

export async function updatePrice(
  id: string,
  input: PriceInput,
): Promise<Result<{ id: string }>> {
  await requireRole(["admin"]);
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("prices")
    .update({
      product_type_id: parsed.data.product_type_id || null,
      brand: parsed.data.brand.trim(),
      model: parsed.data.model.trim(),
      version: parsed.data.version || null,
      model_year: parsed.data.model_year || null,
      currency: parsed.data.currency,
      list_price: Number(parsed.data.list_price),
      notes: parsed.data.notes || null,
      status: parsed.data.status,
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePrices();
  return { ok: true, id };
}

export async function deletePrice(id: string): Promise<Result<{ id: string }>> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("prices").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePrices();
  return { ok: true, id };
}

// Import bulk: rows del Excel/CSV. Skipea filas inválidas y devuelve resumen.
export type PriceImportRow = {
  brand?: string;
  model?: string;
  version?: string;
  model_year?: string;
  currency?: string;
  list_price?: string;
  product_type_name?: string;
  notes?: string;
};

export async function bulkImportPrices(
  rows: PriceImportRow[],
): Promise<Result<{ inserted: number; failed: number }>> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id)
    return { ok: false, message: "No tenés empresa asignada" };

  const supabase = await createClient();

  const { data: types } = await supabase
    .from("product_types")
    .select("id, name")
    .eq("company_id", profile.company_id);

  const typeByName = new Map<string, string>(
    (types ?? []).map((t) => [t.name.toLowerCase(), t.id]),
  );

  let failed = 0;
  const inserts = rows
    .map((r) => {
      if (!r.brand || !r.model || !r.list_price) {
        failed++;
        return null;
      }
      const price = Number(String(r.list_price).replace(/[^0-9.-]/g, ""));
      if (Number.isNaN(price) || price < 0) {
        failed++;
        return null;
      }
      return {
        company_id: profile.company_id!,
        brand: r.brand.trim(),
        model: r.model.trim(),
        version: r.version || null,
        model_year: r.model_year || null,
        currency: r.currency || "ARS",
        list_price: price,
        notes: r.notes || null,
        product_type_id: r.product_type_name
          ? (typeByName.get(r.product_type_name.toLowerCase()) ?? null)
          : null,
        status: "active" as const,
      };
    })
    .filter((row) => row !== null);

  if (inserts.length === 0) {
    return { ok: true, inserted: 0, failed };
  }

  const { error, data } = await supabase
    .from("prices")
    .insert(inserts)
    .select("id");

  if (error) return { ok: false, message: error.message };
  revalidatePrices();
  return { ok: true, inserted: data?.length ?? 0, failed };
}

// ---------------------------------------------------------------------------
// Carga de precios con IA: la IA mapea las columnas del archivo → campos de la
// lista de precios. El cliente parsea el archivo (headers + filas) y las manda
// acá; devolvemos el mapeo, stats, preview y las filas listas para bulkImportPrices.
// ---------------------------------------------------------------------------

export type PriceAnalyzeResult =
  | {
      ok: true;
      mapping: PriceMapping;
      stats: PriceMappingStats;
      preview: PriceMappedRow[];
      okRows: PriceRowData[];
    }
  | { ok: false; message: string };

function buildPriceResult(
  rawRows: Record<string, string>[],
  mapping: PriceMapping,
): PriceAnalyzeResult {
  const { rows, stats } = applyPriceMapping(rawRows, mapping);
  return {
    ok: true,
    mapping,
    stats,
    preview: rows.slice(0, 50),
    okRows: rows.filter((r) => r.status === "ok").map((r) => r.data),
  };
}

export async function analyzePriceImport(input: {
  headers: string[];
  rows: Record<string, string>[];
}): Promise<PriceAnalyzeResult> {
  await requireRole(["admin"]);
  if (input.headers.length === 0 || input.rows.length === 0) {
    return { ok: false, message: "El archivo no tiene columnas o filas válidas" };
  }
  try {
    const mapper = createOpenAiPriceMapper();
    const mapping = await mapper.map({
      headers: input.headers,
      sample: sampleRows(input.rows, 30),
    });
    return buildPriceResult(input.rows, mapping);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error analizando con IA" };
  }
}

export async function regeneratePriceMapping(input: {
  headers: string[];
  rows: Record<string, string>[];
  instruction: string;
}): Promise<PriceAnalyzeResult> {
  await requireRole(["admin"]);
  if (!input.instruction.trim()) {
    return { ok: false, message: "Escribí una instrucción para regenerar" };
  }
  try {
    const mapper = createOpenAiPriceMapper();
    const mapping = await mapper.map({
      headers: input.headers,
      sample: sampleRows(input.rows, 30),
      instruction: input.instruction,
    });
    return buildPriceResult(input.rows, mapping);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error regenerando el mapeo" };
  }
}

export async function reapplyPriceMapping(input: {
  rows: Record<string, string>[];
  mapping: PriceMapping;
}): Promise<PriceAnalyzeResult> {
  await requireRole(["admin"]);
  return buildPriceResult(input.rows, input.mapping);
}

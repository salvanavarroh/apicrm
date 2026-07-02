"use server";

// ============================================================================
// Server actions de la carga de leads con IA (Fase 1).
//
// Flujo (stateless): el cliente sube el archivo al bucket `lead-imports`. Luego:
//  - analyzeImport  → baja + parsea + muestra a la IA → mapeo + preview + stats
//  - regenerateMapping → re-corre el mapeo con una instrucción NL
//  - commitImport   → re-parsea, aplica el mapeo (posiblemente editado), inserta
//                     en batches, crea submissions/consultas y distribuye.
//
// No usamos staging tables: el archivo queda en Storage como fuente de verdad y
// se re-parsea en cada paso (barato). Ver docs/carga-leads-ia.md.
// ============================================================================

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyMapping,
  type ApplyResult,
  type LeadMapping,
  type MappedRow,
} from "@/lib/lead-import";
import { parseImportFile, sampleRows, type ImportFileType } from "@/lib/lead-import-parse";
import { createOpenAiMapper } from "@/lib/lead-mapper";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

const IMPORT_ROLES = ["admin", "manager", "supervisor", "data_provider"] as const;
const BUCKET = "lead-imports";
const PREVIEW_LIMIT = 200;
const INSERT_BATCH = 500;

export type ImportContext = {
  branch_id?: string;
  product_type_id?: string;
  campaign_id?: string;
  source?: string;
  distribution: "round_robin" | "fixed" | "unassigned";
  assignee_id?: string;
};

export type AnalyzeResult =
  | {
      ok: true;
      mapping: LeadMapping;
      stats: ApplyResult["stats"];
      preview: MappedRow[];
    }
  | { ok: false; message: string };

// ----------------------------------------------------------------------------
// Descarga + parseo del archivo desde Storage (scopeado por company_id en path).
// ----------------------------------------------------------------------------

async function loadFile(
  filePath: string,
  fileType: ImportFileType,
  companyId: string,
): Promise<
  | { ok: true; headers: string[]; rows: Record<string, string>[] }
  | { ok: false; message: string }
> {
  // El path debe empezar por el company_id del usuario (defensa en profundidad
  // ya que bajamos con el admin client, que saltea RLS).
  if (!filePath.startsWith(`${companyId}/`)) {
    return { ok: false, message: "Archivo fuera de tu empresa" };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(filePath);
  if (error || !data) {
    return { ok: false, message: error?.message ?? "No pude leer el archivo" };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const { headers, rows } = parseImportFile(buffer, fileType);
  if (headers.length === 0 || rows.length === 0) {
    return { ok: false, message: "El archivo no tiene filas legibles" };
  }
  return { ok: true, headers, rows };
}

async function runMapping(
  filePath: string,
  fileType: ImportFileType,
  companyId: string,
  instruction?: string,
): Promise<AnalyzeResult> {
  const loaded = await loadFile(filePath, fileType, companyId);
  if (!loaded.ok) return { ok: false, message: loaded.message };

  let mapping: LeadMapping;
  try {
    const mapper = createOpenAiMapper();
    mapping = await mapper.map({
      headers: loaded.headers,
      sample: sampleRows(loaded.rows, 30),
      instruction,
    });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Falló el mapeo con IA",
    };
  }

  const applied = applyMapping(loaded.rows, mapping);
  return {
    ok: true,
    mapping,
    stats: applied.stats,
    preview: applied.rows.slice(0, PREVIEW_LIMIT),
  };
}

export async function analyzeImport(
  filePath: string,
  fileType: ImportFileType,
): Promise<AnalyzeResult> {
  const profile = await requireRole([...IMPORT_ROLES]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  return runMapping(filePath, fileType, profile.company_id);
}

export async function regenerateMapping(
  filePath: string,
  fileType: ImportFileType,
  instruction: string,
): Promise<AnalyzeResult> {
  const profile = await requireRole([...IMPORT_ROLES]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  const trimmed = instruction.trim();
  if (!trimmed) return { ok: false, message: "Escribí una instrucción" };
  return runMapping(filePath, fileType, profile.company_id, trimmed);
}

// Re-aplica un mapeo editado a mano (sin IA): re-parsea y recalcula stats +
// preview sobre TODO el archivo. Barato (una lectura de Storage + parse).
export async function reapplyMapping(
  filePath: string,
  fileType: ImportFileType,
  mapping: LeadMapping,
): Promise<AnalyzeResult> {
  const profile = await requireRole([...IMPORT_ROLES]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  const loaded = await loadFile(filePath, fileType, profile.company_id);
  if (!loaded.ok) return { ok: false, message: loaded.message };
  const applied = applyMapping(loaded.rows, mapping);
  return {
    ok: true,
    mapping,
    stats: applied.stats,
    preview: applied.rows.slice(0, PREVIEW_LIMIT),
  };
}

// ----------------------------------------------------------------------------
// Commit: inserta los leads mapeados en batches.
// ----------------------------------------------------------------------------

export type CommitResult =
  | {
      ok: true;
      inserted: number;
      skippedErrors: number;
      skippedDuplicates: number;
    }
  | { ok: false; message: string };

export async function commitImport(
  filePath: string,
  fileType: ImportFileType,
  mapping: LeadMapping,
  context: ImportContext,
): Promise<CommitResult> {
  const profile = await requireRole([...IMPORT_ROLES]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  const companyId = profile.company_id;

  const loaded = await loadFile(filePath, fileType, companyId);
  if (!loaded.ok) return { ok: false, message: loaded.message };

  const applied = applyMapping(loaded.rows, mapping);

  // Solo insertamos filas OK / con avisos. Errores y duplicados en archivo se
  // descartan (el usuario los vio en la revisión).
  const insertable = applied.rows.filter(
    (r) => r.status === "ok" || r.status === "warning",
  );
  const skippedErrors = applied.stats.error;
  let skippedDuplicates = applied.stats.duplicate;

  if (insertable.length === 0) {
    return { ok: false, message: "No hay filas válidas para importar" };
  }

  const supabase = await createClient();

  // Dedup contra la base por external_id (índice parcial company_id+external_id).
  const externalIds = Array.from(
    new Set(
      insertable
        .map((r) => r.data.external_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const existingExternal = new Set<string>();
  for (let i = 0; i < externalIds.length; i += INSERT_BATCH) {
    const chunk = externalIds.slice(i, i + INSERT_BATCH);
    const { data } = await supabase
      .from("leads")
      .select("external_id")
      .eq("company_id", companyId)
      .in("external_id", chunk);
    for (const row of data ?? []) {
      if (row.external_id) existingExternal.add(row.external_id);
    }
  }

  const toInsert = insertable.filter((r) => {
    if (r.data.external_id && existingExternal.has(r.data.external_id)) {
      skippedDuplicates++;
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    return {
      ok: true,
      inserted: 0,
      skippedErrors,
      skippedDuplicates,
    };
  }

  const assignedUserId =
    context.distribution === "fixed" ? context.assignee_id ?? null : null;
  const nowIso = new Date().toISOString();

  let inserted = 0;
  const insertedIds: string[] = [];

  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const batch = toInsert.slice(i, i + INSERT_BATCH);
    const inserts: LeadInsert[] = batch.map((r) => ({
      company_id: companyId,
      first_name: r.data.first_name,
      last_name: r.data.last_name,
      email: r.data.email,
      phone: r.data.phone,
      city: r.data.city,
      locality: r.data.locality,
      province: r.data.province,
      national_id: r.data.national_id,
      birth_date: r.data.birth_date,
      preferred_contact_time: r.data.preferred_contact_time,
      vehicle_brand: r.data.vehicle_brand,
      vehicle_model: r.data.vehicle_model,
      vehicle_version: r.data.vehicle_version,
      preferred_color: r.data.preferred_color,
      budget_min: r.data.budget_min,
      budget_max: r.data.budget_max,
      has_used_car: r.data.has_used_car,
      used_car_description: r.data.used_car_description,
      declared_payment_method: r.data.declared_payment_method,
      initial_notes: r.data.initial_notes,
      source: context.source || r.data.source,
      external_id: r.data.external_id,
      source_created_at: r.data.source_created_at,
      utm_source: r.data.utm_source,
      utm_medium: r.data.utm_medium,
      utm_campaign: r.data.utm_campaign,
      utm_term: r.data.utm_term,
      utm_content: r.data.utm_content,
      landing_url: r.data.landing_url,
      referrer: r.data.referrer,
      metadata: r.data.metadata,
      branch_id: context.branch_id || null,
      product_type_id: context.product_type_id || null,
      campaign_id: context.campaign_id || null,
      created_by: profile.id,
      assigned_user_id: assignedUserId,
      assigned_at: assignedUserId ? nowIso : null,
    }));

    const { data, error } = await supabase
      .from("leads")
      .insert(inserts)
      .select("id");
    if (error) {
      return {
        ok: false,
        message: `Error insertando (van ${inserted}): ${error.message}`,
      };
    }
    inserted += data?.length ?? 0;
    for (const row of data ?? []) insertedIds.push(row.id);
  }

  // Distribución round-robin: auto-asignar por gerencia (solo si clasificado).
  if (
    context.distribution === "round_robin" &&
    context.branch_id &&
    context.product_type_id
  ) {
    for (const id of insertedIds) {
      await supabase.rpc("auto_assign_lead", { p_lead_id: id });
    }
  }

  // Borramos el archivo crudo tras el commit exitoso (no lo retenemos).
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([filePath]);

  revalidatePath("/admin/leads");
  revalidatePath("/manager/leads");
  revalidatePath("/data-provider/leads");

  return { ok: true, inserted, skippedErrors, skippedDuplicates };
}

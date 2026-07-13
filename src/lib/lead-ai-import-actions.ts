"use server";

// ============================================================================
// Server actions de la carga de leads con IA (Fase 1).
//
// Flujo (stateless): el cliente sube el archivo al bucket `lead-imports`. Luego:
//  - analyzeImport  → baja + parsea + muestra a la IA → mapeo + preview + stats
//  - regenerateMapping → re-corre el mapeo con una instrucción NL
//  - enqueueImport  → crea un job y dispara el procesamiento en segundo plano
//                     (/api/leads-import/process). getImportJob/resumeImport
//                     para hacer polling del progreso y reanudar si se traba.
//
// No usamos staging tables: el archivo queda en Storage como fuente de verdad y
// se re-parsea en cada paso (barato). Ver docs/carga-leads-ia.md.
// ============================================================================

import { headers } from "next/headers";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyMapping,
  type ApplyResult,
  type ImportContext,
  type LeadMapping,
  type MappedRow,
} from "@/lib/lead-import";
import { parseImportFile, sampleRows, type ImportFileType } from "@/lib/lead-import-parse";
import { createOpenAiMapper } from "@/lib/lead-mapper";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type { ImportContext };

const IMPORT_ROLES = ["admin", "manager", "supervisor", "data_provider"] as const;
const BUCKET = "lead-imports";
const PREVIEW_LIMIT = 200;
// Un job se considera "trabado" si sigue pending/processing pero no avanza hace
// más de este tiempo (el procesador toca updated_at en cada tanda).
const STALE_MS = 30_000;

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
// Commit en segundo plano: se crea un job y la route /api/leads-import/process
// lo procesa por tandas (re-invocándose). El cliente hace polling del progreso;
// si se traba, puede reanudar.
// ----------------------------------------------------------------------------

export type ImportJob = {
  id: string;
  status: "pending" | "processing" | "done" | "error";
  total: number;
  processed: number;
  inserted: number;
  skippedDuplicates: number;
  skippedErrors: number;
  error: string | null;
  // Sigue pending/processing pero no avanza hace rato → ofrecer "Reanudar".
  stale: boolean;
};

type JobInsert = Database["public"]["Tables"]["lead_import_jobs"]["Insert"];
type JobRow = Database["public"]["Tables"]["lead_import_jobs"]["Row"];

// Dispara (o re-dispara) el procesamiento. /process responde al toque (el
// trabajo pesado corre en su after()), así que este await es rápido.
async function kickProcess(jobId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  try {
    await fetch(`${proto}://${host}/api/leads-import/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ jobId }),
    });
  } catch {
    // Si falla el disparo, el job queda pending → el usuario puede reanudar.
  }
}

export async function enqueueImport(
  filePath: string,
  fileType: ImportFileType,
  mapping: LeadMapping,
  context: ImportContext,
): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  const profile = await requireRole([...IMPORT_ROLES]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  if (!filePath.startsWith(`${profile.company_id}/`)) {
    return { ok: false, message: "Archivo fuera de tu empresa" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_import_jobs")
    .insert({
      company_id: profile.company_id,
      created_by: profile.id,
      file_path: filePath,
      file_type: fileType,
      mapping: mapping as unknown as JobInsert["mapping"],
      context: context as unknown as JobInsert["context"],
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "No pude crear la importación",
    };
  }

  await kickProcess(data.id);
  return { ok: true, jobId: data.id };
}

function toImportJob(row: JobRow): ImportJob {
  const active = row.status === "pending" || row.status === "processing";
  const stale =
    active && Date.now() - new Date(row.updated_at).getTime() > STALE_MS;
  return {
    id: row.id,
    status: row.status as ImportJob["status"],
    total: row.total,
    processed: row.processed,
    inserted: row.inserted,
    skippedDuplicates: row.skipped_duplicates,
    skippedErrors: row.skipped_errors,
    error: row.error,
    stale,
  };
}

export async function getImportJob(jobId: string): Promise<ImportJob | null> {
  await requireRole([...IMPORT_ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  return data ? toImportJob(data) : null;
}

export async function resumeImport(
  jobId: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole([...IMPORT_ROLES]);
  const supabase = await createClient();
  // La RLS asegura que sólo se ve/reanuda un job de la propia empresa.
  const { data } = await supabase
    .from("lead_import_jobs")
    .select("id, status")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return { ok: false, message: "No encontré la importación" };
  if (data.status === "done") return { ok: true };
  await kickProcess(jobId);
  return { ok: true };
}

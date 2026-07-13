import { after, NextResponse, type NextRequest } from "next/server";

import {
  applyMapping,
  type ImportContext,
  type LeadMapping,
} from "@/lib/lead-import";
import { insertMappedChunk } from "@/lib/lead-import-commit";
import { parseImportFile, type ImportFileType } from "@/lib/lead-import-parse";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

// Procesa un job de importación por tandas. Se auto-reinvoca hasta terminar
// para no chocar con el timeout de la función. Auth: Bearer CRON_SECRET (mismo
// secreto interno que el cron de pagos; NO se agenda como cron).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUCKET = "lead-imports";
const CHUNK = 500;
// Handoff por lo que ocurra primero: tiempo o cantidad de tandas. El tope de
// tandas mantiene cada invocación corta aunque el plan limite la función a
// pocos segundos; entre invocaciones se re-parsea el archivo (barato).
const TIME_BUDGET_MS = 30_000;
const MAX_CHUNKS_PER_RUN = 6; // 6 × 500 = 3000 filas por invocación
const LOCK_STALE_SEC = 25;

type Admin = ReturnType<typeof createAdminClient>;
type Job = Database["public"]["Tables"]["lead_import_jobs"]["Row"];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) {
    return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - LOCK_STALE_SEC * 1000).toISOString();

  // Claim atómico: sólo procede si el job está pendiente/en proceso y no hay
  // otro procesándolo (lock nulo o vencido). Evita doble procesamiento.
  const { data: job } = await admin
    .from("lead_import_jobs")
    .update({ status: "processing", locked_at: nowIso, updated_at: nowIso })
    .eq("id", jobId)
    .in("status", ["pending", "processing"])
    .or(`locked_at.is.null,locked_at.lt.${staleIso}`)
    .select()
    .maybeSingle();

  if (!job) {
    // Ya terminó, o hay otra invocación activa con lock fresco.
    return NextResponse.json({ skipped: true });
  }

  const origin = new URL(req.url).origin;
  // El trabajo pesado corre DESPUÉS de responder → la respuesta es inmediata y
  // el llamador no queda bloqueado.
  after(() => processJob(admin, job, origin, secret));
  return NextResponse.json({ ok: true, jobId });
}

async function touch(admin: Admin, jobId: string, patch: Record<string, unknown>) {
  await admin
    .from("lead_import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function processJob(
  admin: Admin,
  job: Job,
  origin: string,
  secret: string,
) {
  try {
    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(job.file_path);
    if (dlErr || !blob) {
      await touch(admin, job.id, {
        status: "error",
        error: dlErr?.message ?? "No pude leer el archivo",
        locked_at: null,
      });
      return;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const parsed = parseImportFile(buffer, job.file_type as ImportFileType);
    const applied = applyMapping(
      parsed.rows,
      job.mapping as unknown as LeadMapping,
    );
    const insertable = applied.rows.filter(
      (r) => r.status === "ok" || r.status === "warning",
    );
    const total = insertable.length;
    const context = job.context as unknown as ImportContext;

    // En la primera pasada fijamos el total y los errores de archivo.
    if (job.total !== total) {
      await touch(admin, job.id, {
        total,
        skipped_errors: applied.stats.error,
      });
    }

    let processed = job.processed;
    let inserted = job.inserted;
    let skippedDuplicates = job.skipped_duplicates;
    const start = Date.now();
    let chunksThisRun = 0;

    while (processed < total) {
      const chunk = insertable.slice(processed, processed + CHUNK);
      const res = await insertMappedChunk(
        admin,
        job.company_id,
        job.created_by,
        context,
        chunk,
      );
      if (res.error) {
        await touch(admin, job.id, {
          status: "error",
          error: `Error insertando (van ${inserted}): ${res.error}`,
          processed,
          inserted,
          skipped_duplicates: skippedDuplicates,
          locked_at: null,
        });
        return;
      }
      processed += chunk.length;
      inserted += res.inserted;
      skippedDuplicates += res.skippedDuplicates;
      chunksThisRun++;
      await touch(admin, job.id, {
        processed,
        inserted,
        skipped_duplicates: skippedDuplicates,
        locked_at: new Date().toISOString(),
      });

      // Handoff (tiempo o tope de tandas): liberar el lock y re-invocar.
      if (
        processed < total &&
        (chunksThisRun >= MAX_CHUNKS_PER_RUN ||
          Date.now() - start > TIME_BUDGET_MS)
      ) {
        await touch(admin, job.id, { status: "pending", locked_at: null });
        void fetch(`${origin}/api/leads-import/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ jobId: job.id }),
        }).catch(() => {});
        return;
      }
    }

    // Terminado.
    await touch(admin, job.id, {
      status: "done",
      processed,
      inserted,
      skipped_duplicates: skippedDuplicates,
      locked_at: null,
    });
    await admin.storage.from(BUCKET).remove([job.file_path]);
  } catch (e) {
    await touch(admin, job.id, {
      status: "error",
      error: e instanceof Error ? e.message : "Error inesperado",
      locked_at: null,
    });
  }
}

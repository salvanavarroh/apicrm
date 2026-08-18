"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  guessColumnMap,
  readSheetHeaders,
  syncSheetSource,
  type SyncResult,
} from "@/lib/sheets/sync";
import { createClient } from "@/lib/supabase/server";

// Server actions de las fuentes de Google Sheets. Todo requiere admin.

type Result = { ok: true } | { ok: false; message: string };

export type SheetSourceRow = {
  id: string;
  name: string;
  spreadsheet_id: string;
  gid: string;
  column_map: Record<string, string>;
  branch_id: string | null;
  product_type_id: string | null;
  campaign_id: string | null;
  active: boolean;
  poll_minutes: number;
  last_synced_at: string | null;
  last_result: string | null;
  last_error: string | null;
  total_imported: number;
};

export async function listSheetSources(): Promise<SheetSourceRow[]> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("sheet_sources")
    .select("*")
    .eq("company_id", profile.company_id!)
    .order("created_at");
  return (data ?? []) as unknown as SheetSourceRow[];
}

/**
 * Lee los encabezados de la planilla y propone el mapeo de columnas.
 * Es el paso que evita que el admin tenga que escribir el mapeo a mano.
 */
export async function inspectSheet(input: {
  spreadsheetId: string;
  gid: string;
}) {
  await requireRole(["admin"]);
  const res = await readSheetHeaders(input.spreadsheetId, input.gid);
  return { ...res, suggested: guessColumnMap(res.headers) };
}

export async function saveSheetSource(input: {
  id?: string;
  name: string;
  spreadsheetId: string;
  gid: string;
  columnMap: Record<string, string>;
  branchId: string | null;
  productTypeId: string | null;
  campaignId: string | null;
  active: boolean;
  pollMinutes: number;
}): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  // Sin teléfono ni email mapeados no se puede crear ningún lead: la tabla lo
  // rechaza por constraint. Mejor avisarlo acá que descubrirlo en el cron.
  if (!input.columnMap.phone && !input.columnMap.email) {
    return {
      ok: false,
      message: "Mapeá al menos Teléfono o Email: sin eso no se puede crear el lead",
    };
  }

  const payload = {
    company_id: profile.company_id!,
    name: input.name.trim(),
    spreadsheet_id: input.spreadsheetId.trim(),
    gid: input.gid.trim() || "0",
    column_map: input.columnMap,
    branch_id: input.branchId,
    product_type_id: input.productTypeId,
    campaign_id: input.campaignId,
    active: input.active,
    poll_minutes: input.pollMinutes,
    created_by: profile.id,
  };

  const { error } = input.id
    ? await supabase.from("sheet_sources").update(payload).eq("id", input.id)
    : await supabase.from("sheet_sources").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Esa hoja ya está configurada" };
    }
    return { ok: false, message: error.message };
  }
  revalidatePath("/admin/sheets");
  return { ok: true };
}

export async function deleteSheetSource(id: string): Promise<Result> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("sheet_sources").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/sheets");
  return { ok: true };
}

/** Corre la sincronización ahora, sin esperar al cron. */
export async function syncNow(id: string): Promise<SyncResult> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("sheet_sources")
    .select("*")
    .eq("id", id)
    .eq("company_id", profile.company_id!)
    .maybeSingle();

  if (!data) {
    return {
      ok: false,
      read: 0,
      imported: 0,
      skippedDuplicate: 0,
      skippedNoContact: 0,
      skippedAlreadySynced: 0,
      message: "Fuente no encontrada",
    };
  }

  const res = await syncSheetSource({
    id: data.id,
    company_id: data.company_id,
    spreadsheet_id: data.spreadsheet_id,
    gid: data.gid,
    column_map: (data.column_map ?? {}) as Record<string, string>,
    branch_id: data.branch_id,
    product_type_id: data.product_type_id,
    campaign_id: data.campaign_id,
  });
  revalidatePath("/admin/sheets");
  return res;
}

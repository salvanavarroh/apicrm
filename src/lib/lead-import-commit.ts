// ============================================================================
// Núcleo del commit de la importación de leads: construir el insert desde una
// fila mapeada, dedupear contra la base por external_id, insertar y asignar.
// Server-only (recibe el cliente de supabase). Lo usa la route de background
// (`/api/leads-import/process`) por tandas. No es "use server": son helpers.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportContext, MappedRow } from "@/lib/lead-import";
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type Client = SupabaseClient<Database>;

export function buildLeadInsert(
  companyId: string,
  createdBy: string,
  context: ImportContext,
  data: MappedRow["data"],
): LeadInsert {
  const assignedUserId =
    context.distribution === "fixed" ? context.assignee_id ?? null : null;
  const nowIso = new Date().toISOString();
  return {
    company_id: companyId,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    locality: data.locality,
    province: data.province,
    national_id: data.national_id,
    birth_date: data.birth_date,
    preferred_contact_time: data.preferred_contact_time,
    vehicle_brand: data.vehicle_brand,
    vehicle_model: data.vehicle_model,
    vehicle_version: data.vehicle_version,
    preferred_color: data.preferred_color,
    budget_min: data.budget_min,
    budget_max: data.budget_max,
    has_used_car: data.has_used_car,
    used_car_description: data.used_car_description,
    declared_payment_method: data.declared_payment_method,
    initial_notes: data.initial_notes,
    source: context.source || data.source,
    external_id: data.external_id,
    source_created_at: data.source_created_at,
    utm_source: data.utm_source,
    utm_medium: data.utm_medium,
    utm_campaign: data.utm_campaign,
    utm_term: data.utm_term,
    utm_content: data.utm_content,
    landing_url: data.landing_url,
    referrer: data.referrer,
    metadata: data.metadata,
    branch_id: context.branch_id || null,
    product_type_id: context.product_type_id || null,
    campaign_id: context.campaign_id || null,
    created_by: createdBy,
    assigned_user_id: assignedUserId,
    assigned_at: assignedUserId ? nowIso : null,
  };
}

export type ChunkResult = {
  inserted: number;
  insertedIds: string[];
  skippedDuplicates: number;
  error?: string;
};

/**
 * Inserta una tanda de filas mapeadas: dedup contra la base por external_id,
 * insert, y asignación round-robin de esa tanda (si corresponde). Idempotente
 * ante reintentos para filas con external_id (el dedup las descarta).
 */
export async function insertMappedChunk(
  client: Client,
  companyId: string,
  createdBy: string,
  context: ImportContext,
  rows: MappedRow[],
): Promise<ChunkResult> {
  let skippedDuplicates = 0;

  // Dedup contra la base por external_id.
  const externalIds = Array.from(
    new Set(
      rows.map((r) => r.data.external_id).filter((v): v is string => Boolean(v)),
    ),
  );
  const existing = new Set<string>();
  if (externalIds.length > 0) {
    const { data } = await client
      .from("leads")
      .select("external_id")
      .eq("company_id", companyId)
      .in("external_id", externalIds);
    for (const row of data ?? []) {
      if (row.external_id) existing.add(row.external_id);
    }
  }

  const toInsert = rows.filter((r) => {
    if (r.data.external_id && existing.has(r.data.external_id)) {
      skippedDuplicates++;
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    return { inserted: 0, insertedIds: [], skippedDuplicates };
  }

  const inserts = toInsert.map((r) =>
    buildLeadInsert(companyId, createdBy, context, r.data),
  );
  const { data, error } = await client
    .from("leads")
    .insert(inserts)
    .select("id");
  if (error) {
    return { inserted: 0, insertedIds: [], skippedDuplicates, error: error.message };
  }
  const insertedIds = (data ?? []).map((l) => l.id);

  // Distribución round-robin balanceada de esta tanda.
  if (
    context.distribution === "round_robin" &&
    context.branch_id &&
    context.product_type_id &&
    insertedIds.length > 0
  ) {
    await client.rpc("bulk_assign_leads", { p_lead_ids: insertedIds });
  }

  return { inserted: insertedIds.length, insertedIds, skippedDuplicates };
}

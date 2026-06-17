import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail, normalizePhone } from "@/lib/leads";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

// Ventana de identidad del lead. Dentro de esta ventana, un nuevo ingreso del
// mismo cliente (teléfono/email) se considera el MISMO lead: se le agrega la
// consulta y conserva su vendedor. Pasada la ventana (día 32+), es un lead nuevo
// que vuelve al round-robin. Pedido Salvador (#5/#6).
export const REENTRY_WINDOW_DAYS = 31;

export type ReentryMatch = {
  id: string;
  assigned_user_id: string | null;
  created_at: string;
};

/**
 * Busca un lead previo (mismo teléfono o email, misma empresa) creado dentro de
 * la ventana de reingreso. Si existe, el nuevo contacto es el mismo lead.
 */
export async function findReentryLead(
  supabase: Client,
  companyId: string,
  phone: string | null,
  email: string | null,
): Promise<ReentryMatch | null> {
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);
  if (!cleanPhone && !cleanEmail) return null;

  const filters: string[] = [];
  if (cleanPhone) filters.push(`phone.eq.${cleanPhone}`);
  if (cleanEmail) filters.push(`email.eq.${cleanEmail}`);

  const cutoff = new Date(
    Date.now() - REENTRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data } = await supabase
    .from("leads")
    .select("id, assigned_user_id, created_at")
    .eq("company_id", companyId)
    .or(filters.join(","))
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export type VehicleData = {
  vehicle_model?: string | null;
  vehicle_version?: string | null;
  preferred_color?: string | null;
  notes?: string | null;
};

function hasVehicleData(v: VehicleData): boolean {
  return Boolean(
    v.vehicle_model || v.vehicle_version || v.preferred_color || v.notes,
  );
}

/**
 * Agrega una consulta (auto) al lead. No hace nada si no hay datos de vehículo.
 */
export async function appendLeadVehicle(
  supabase: Client,
  leadId: string,
  companyId: string,
  vehicle: VehicleData,
): Promise<void> {
  if (!hasVehicleData(vehicle)) return;
  await supabase.from("lead_vehicles").insert({
    lead_id: leadId,
    company_id: companyId,
    vehicle_model: vehicle.vehicle_model ?? null,
    vehicle_version: vehicle.vehicle_version ?? null,
    preferred_color: vehicle.preferred_color ?? null,
    notes: vehicle.notes ?? null,
  });
}

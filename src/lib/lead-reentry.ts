import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/leads";
import { toE164 } from "@/lib/phone";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** País (ISO-2) de la empresa, para normalizar teléfonos locales a E.164. */
export async function companyCountry(
  supabase: Client,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  return data?.country ?? null;
}

/** Resuelve el teléfono canónico E.164 de un lead con el país de su empresa. */
export async function resolveCompanyE164(
  supabase: Client,
  companyId: string,
  rawPhone: string | null | undefined,
): Promise<string | null> {
  if (!rawPhone) return null;
  const country = await companyCountry(supabase, companyId);
  return toE164(rawPhone, country);
}

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
  const cleanEmail = normalizeEmail(email);
  // Match por teléfono CANÓNICO E.164 (multi-país) para que colapsen las
  // distintas formas del mismo número (form web, WhatsApp, Lead Ads).
  const country = await companyCountry(supabase, companyId);
  const e164 = toE164(phone, country);
  if (!e164 && !cleanEmail) return null;

  const filters: string[] = [];
  if (e164) filters.push(`phone_e164.eq.${e164}`);
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
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_version?: string | null;
  preferred_color?: string | null;
  notes?: string | null;
};

function hasVehicleData(v: VehicleData): boolean {
  return Boolean(
    v.vehicle_brand ||
      v.vehicle_model ||
      v.vehicle_version ||
      v.preferred_color ||
      v.notes,
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
    vehicle_brand: vehicle.vehicle_brand ?? null,
    vehicle_model: vehicle.vehicle_model ?? null,
    vehicle_version: vehicle.vehicle_version ?? null,
    preferred_color: vehicle.preferred_color ?? null,
    notes: vehicle.notes ?? null,
  });
}

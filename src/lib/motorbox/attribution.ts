import { appendLeadVehicle } from "@/lib/lead-reentry";
import { describeListing, fetchListing, type MotorboxListing } from "@/lib/motorbox/listings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// ============================================================================
// Atribución de leads que vienen de Motorbox.
//
// Se dispara cuando un WhatsApp entrante trae el marcador [MB:xxxx].
// Ver docs/motorbox-spec-api.md §6.3.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;

/**
 * La campaña "Motorbox" de una empresa, creándola si no existe.
 *
 * El índice único parcial `campaigns_motorbox_unique` hace que dos webhooks
 * simultáneos no puedan crear dos filas: el segundo choca y re-selecciona.
 */
export async function ensureMotorboxCampaign(
  admin: Admin,
  companyId: string,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("company_id", companyId)
    .eq("origin", "marketplace")
    .eq("name", "Motorbox")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await admin
    .from("campaigns")
    .insert({
      company_id: companyId,
      name: "Motorbox",
      origin: "marketplace",
      status: "active",
    })
    .select("id")
    .maybeSingle();
  if (created) return created.id;

  // Perdimos la carrera contra otro webhook: la fila ya existe.
  const { data: raced } = await admin
    .from("campaigns")
    .select("id")
    .eq("company_id", companyId)
    .eq("origin", "marketplace")
    .eq("name", "Motorbox")
    .maybeSingle();
  return raced?.id ?? null;
}

export type MotorboxMatch = {
  listing: MotorboxListing;
  campaignId: string | null;
};

/**
 * Resuelve el marcador: trae la publicación y verifica que sea de ESTA empresa.
 *
 * El chequeo de pertenencia es la defensa contra alguien que pega un código
 * ajeno en un mensaje. Si no coincide, devolvemos null y el mensaje se trata
 * como un WhatsApp común.
 *
 * Dos motivos distintos para no coincidir, y conviene distinguirlos en el log
 * porque significan cosas muy distintas:
 *
 *   - `api_crm_company_id: null` → el aviso es de una concesionaria que se dio
 *     de alta directo en Motorbox y no existe en el CRM. Es NORMAL: el
 *     marketplace tiene vendedores que no son clientes nuestros.
 *   - un uuid que no es el nuestro → alguien pegó el código de otra
 *     concesionaria. Eso sí es anómalo y vale la pena verlo en los logs.
 *
 * Acordado con Motorbox (23/09/2026): para un aviso que no viene de API CRM,
 * el campo llega PRESENTE y en `null`. Un campo ausente y uno nulo se ven igual
 * desde acá, pero `null` explícito dice "lo miramos, no es de API" en vez de
 * "puede que se nos haya perdido en la serialización".
 */
export async function resolveMotorboxMatch(
  admin: Admin,
  code: string,
  companyId: string,
): Promise<MotorboxMatch | null> {
  const listing = await fetchListing(code);
  if (!listing) return null;

  if (listing.api_crm_company_id == null) {
    // Concesionaria propia de Motorbox: no hay nada que atribuir de este lado.
    return null;
  }

  if (listing.api_crm_company_id !== companyId) {
    console.warn(
      `[motorbox] el aviso ${code} es de otra concesionaria — se ignora el marcador`,
    );
    return null;
  }

  return { listing, campaignId: await ensureMotorboxCampaign(admin, companyId) };
}

/** Los campos con los que se crea un lead nuevo originado en Motorbox. */
export function leadFieldsFor(match: MotorboxMatch): {
  source: string;
  campaign_id: string | null;
  metadata: Record<string, unknown>;
} {
  return {
    source: "Motorbox",
    campaign_id: match.campaignId,
    metadata: {
      motorbox: {
        listing_code: match.listing.public_code,
        listing_url: match.listing.url,
        // Precio Y moneda, siempre juntos. Un número solo es ambiguo: Motorbox
        // admite pesos y dólares y no convierte.
        price: match.listing.price,
        currency: match.listing.currency,
        matched_at: new Date().toISOString(),
      },
    },
  };
}

/**
 * Registra el vehículo consultado en un lead (nuevo o existente).
 *
 * Para un lead que YA existía no tocamos `source` ni `campaign_id`: esa persona
 * ya era lead de otro canal y pisar su atribución arruina los reportes de
 * origen. Sólo sumamos el auto y dejamos constancia del toque.
 */
export async function recordMotorboxTouch(
  admin: Admin,
  leadId: string,
  companyId: string,
  match: MotorboxMatch,
  opts: { isNewLead: boolean },
): Promise<void> {
  const { listing } = match;

  await appendLeadVehicle(admin, leadId, companyId, {
    vehicle_brand: listing.brand,
    vehicle_model: listing.model,
    vehicle_version: listing.version,
    notes: describeListing(listing),
  });

  if (opts.isNewLead) return;

  // Lead preexistente: dejamos el toque en metadata y una nota visible.
  const { data: lead } = await admin
    .from("leads")
    .select("metadata")
    .eq("id", leadId)
    .maybeSingle();

  const metadata = (lead?.metadata ?? {}) as Record<string, unknown>;
  const touches = Array.isArray(metadata.motorbox_touches)
    ? (metadata.motorbox_touches as unknown[])
    : [];
  touches.push({
    listing_code: listing.public_code,
    at: new Date().toISOString(),
  });

  await admin
    .from("leads")
    .update({
      metadata: { ...metadata, motorbox_touches: touches } as Json,
    })
    .eq("id", leadId);

  await admin.from("lead_notes").insert({
    lead_id: leadId,
    company_id: companyId,
    content: `Consultó por ${describeListing(listing)} desde Motorbox.`,
    activity_type: "whatsapp",
    // Sin author_id: la nota la escribe el sistema, no una persona.
  });
}

"use server";

import { requireRole } from "@/lib/auth";
import { getAd, getAdMedia } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

export type LeadAdCreative = {
  adId: string;
  /** Nombre del anuncio y de la campaña, cuando Zernio los devuelve. */
  name: string | null;
  campaign: string | null;
  adSet: string | null;
  media: { type: "image" | "video"; url: string; thumbnailUrl?: string }[];
};

/**
 * La creatividad que vio el cliente antes de dejar sus datos.
 *
 * Se pide RECIÉN cuando el vendedor despliega el bloque, no al abrir la ficha:
 * es una llamada a la API de Zernio y las URLs que devuelve están firmadas y
 * vencen, así que cachearlas no serviría de nada.
 */
export async function loadLeadAdCreative(
  leadId: string,
): Promise<{ ok: true; creative: LeadAdCreative } | { ok: false; message: string }> {
  const profile = await requireRole([
    "admin",
    "manager",
    "supervisor",
    "sales",
  ]);
  const admin = createAdminClient();

  // El lead se busca con el cliente de service-role pero acotado a la empresa
  // del usuario: la ficha ya validó que puede verlo.
  const { data: lead } = await admin
    .from("leads")
    .select("metadata")
    .eq("id", leadId)
    .eq("company_id", profile.company_id!)
    .maybeSingle();

  const adId = (lead?.metadata as { adId?: string } | null)?.adId;
  if (!adId) {
    return { ok: false, message: "Este lead no tiene un anuncio asociado." };
  }

  try {
    // El detalle es opcional: si falla, igual se muestra la imagen.
    const [media, detail] = await Promise.all([
      getAdMedia(adId),
      getAd(adId).catch(() => null),
    ]);
    return {
      ok: true,
      creative: {
        adId,
        name: detail?.ad?.name ?? null,
        campaign: detail?.ad?.campaignName ?? null,
        adSet: detail?.ad?.adSetName ?? null,
        media: media.media ?? [],
      },
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? `No pude traer el anuncio: ${e.message}`
          : "No pude traer el anuncio.",
    };
  }
}

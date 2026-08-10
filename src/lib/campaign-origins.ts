import type { Database } from "@/types/database";

export type CampaignOrigin = Database["public"]["Enums"]["campaign_origin"];

/**
 * Etiquetas de canal/origen de campaña. Vive en lib (no en un componente
 * client) para que la puedan usar tanto las pantallas como los loaders de
 * reportes que corren en el server.
 */
export const CAMPAIGN_ORIGIN_LABELS: Record<CampaignOrigin, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  showroom: "Mostrador",
  referral: "Referido",
  web: "Web",
  email: "Email",
  instagram: "Instagram",
  tiktok_ads: "TikTok Ads",
  marketplace: "Marketplace",
  portal_usados: "Portal de usados",
  inbound_call: "Llamada entrante",
  other: "Otros",
};

/** Clave usada para agrupar leads que no tienen campaña asociada. */
export const NO_CAMPAIGN_KEY = "none";

export function channelLabel(key: string): string {
  if (key === NO_CAMPAIGN_KEY) return "Sin campaña / Directo";
  return CAMPAIGN_ORIGIN_LABELS[key as CampaignOrigin] ?? key;
}

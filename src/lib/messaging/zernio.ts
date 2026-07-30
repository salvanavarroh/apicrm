// ============================================================================
// Cliente de la API de Zernio (adaptador). Server-only: usa ZERNIO_API_KEY.
// Toda la UI/actions hablan con estas funciones, nunca con fetch crudo.
// Base: https://zernio.com/api/v1 · Auth: Bearer.
// Re-verificar shapes contra la doc viva al integrar.
// ============================================================================

import { getServerEnv } from "@/lib/env";

const BASE = "https://zernio.com/api/v1";

export type ZernioPlatform = "whatsapp" | "instagram" | "facebook";

export class ZernioError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiKey(): string {
  const key = getServerEnv().ZERNIO_API_KEY;
  if (!key) throw new ZernioError(500, "ZERNIO_API_KEY no configurada");
  return key;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no-JSON */
  }
  if (!res.ok) {
    const err = json as { error?: string; code?: string } | null;
    throw new ZernioError(res.status, err?.error ?? `HTTP ${res.status}`, err?.code);
  }
  return json as T;
}

// --- Profiles (tenants) -----------------------------------------------------
export async function createProfile(name: string, description?: string) {
  return request<{ profile: { _id: string } }>("POST", "/profiles", {
    name,
    description,
  });
}

export type ZernioAccount = {
  _id?: string;
  accountId?: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  isActive?: boolean;
  enabled?: boolean;
  needsReconnection?: boolean;
  platformStatus?: string;
};

export async function listAccounts(
  profileId?: string,
): Promise<{ accounts: ZernioAccount[] }> {
  const q = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  return request<{ accounts: ZernioAccount[] }>("GET", `/accounts${q}`);
}

// Desconecta/borra una cuenta conectada en Zernio (WhatsApp/IG/FB). Corta el
// canal: deja de recibir mensajes y de facturar esa cuenta.
export async function deleteAccount(accountId: string): Promise<unknown> {
  return request("DELETE", `/accounts/${encodeURIComponent(accountId)}`);
}

// --- Connect flow -----------------------------------------------------------
export async function getConnectUrl(
  platform: ZernioPlatform,
  profileId: string,
  redirectUrl: string,
): Promise<{ authUrl: string; state?: string }> {
  const q = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  return request("GET", `/connect/${platform}?${q.toString()}`);
}

// --- WhatsApp: salud del número --------------------------------------------
export type NumberInfo = {
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  status?: string;
  display_phone_number?: string;
};
export async function getNumberInfo(accountId: string): Promise<NumberInfo> {
  return request("GET", `/whatsapp/number-info?accountId=${encodeURIComponent(accountId)}`);
}

// --- Inbox: enviar / marcar leído ------------------------------------------
export type SendResult = {
  success?: boolean;
  data?: { messageId?: string; conversationId?: string; sentAt?: string };
};

export async function sendInboxMessage(
  conversationId: string,
  payload: {
    accountId: string;
    message?: string;
    attachmentUrl?: string;
    attachmentType?: "image" | "video" | "audio" | "file";
    attachmentName?: string;
    template?: unknown;
  },
): Promise<SendResult> {
  return request("POST", `/inbox/conversations/${conversationId}/messages`, payload);
}

// Iniciar conversación nueva / enviar template a un número sin ventana abierta.
export async function startConversation(payload: {
  accountId: string;
  participantId: string; // E.164 sin '+', solo dígitos
  templateName: string;
  templateLanguage: string;
  templateParams?: string[];
  headerMedia?: { link?: string; id?: string };
}): Promise<SendResult> {
  return request("POST", `/inbox/conversations`, payload);
}

export async function markRead(conversationId: string, accountId: string) {
  return request("POST", `/inbox/conversations/${conversationId}/read`, { accountId });
}

/**
 * Baja un adjunto (audio/imagen/video/archivo) de un mensaje. Los media de
 * WhatsApp viven en `zernio.com/api/v1/...` y requieren el Bearer del API key;
 * los de Meta (Instagram/Facebook) son URLs firmadas de su CDN que se bajan
 * directo. Se usa desde el proxy server-side para no exponer la key al browser.
 */
export async function fetchMedia(url: string): Promise<Response> {
  const isZernio = url.startsWith(BASE) || url.startsWith("https://zernio.com/");
  return fetch(url, {
    headers: isZernio ? { Authorization: `Bearer ${apiKey()}` } : {},
    cache: "no-store",
  });
}

export type ZernioConversationDetail = {
  participantName?: string | null;
  participantUsername?: string | null;
  participantPicture?: string | null;
};

/**
 * Detalle de una conversación. Útil en redes (IG/FB): el webhook `message.received`
 * a veces NO trae el nombre/usuario del contacto (vienen en `conversation.started`),
 * pero este endpoint los expone on-demand junto con la foto de perfil.
 */
export async function getConversationDetail(
  conversationId: string,
  accountId: string,
): Promise<ZernioConversationDetail> {
  const res = await request<{ data?: ZernioConversationDetail }>(
    "GET",
    `/inbox/conversations/${conversationId}?accountId=${encodeURIComponent(accountId)}`,
  );
  return res.data ?? {};
}

// --- Templates --------------------------------------------------------------
export type TemplateComponent = Record<string, unknown>;
export async function createTemplate(payload: {
  accountId: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponent[];
}) {
  return request<{ id?: string; name?: string; status?: string }>(
    "POST",
    `/whatsapp/templates`,
    payload,
  );
}

export async function listTemplates(accountId: string) {
  return request<{ data?: unknown[] } | unknown[]>(
    "GET",
    `/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`,
  );
}

// --- Lead Ads ---------------------------------------------------------------
export type LeadFormDefinition = {
  id: string;
  name?: string;
  questions?: Array<{
    key?: string;
    label?: string;
    type?: string;
    options?: Array<{ key?: string; value?: string }>;
  }>;
};
export async function getLeadForm(formId: string): Promise<LeadFormDefinition> {
  return request("GET", `/ads/lead-forms/${formId}`);
}

// Lista los formularios de Lead Ads ya cargados en la cuenta (Page) conectada.
export async function listLeadForms(
  accountId: string,
): Promise<{ forms?: LeadFormDefinition[]; data?: LeadFormDefinition[] }> {
  return request("GET", `/ads/lead-forms?accountId=${encodeURIComponent(accountId)}`);
}

// --- Ads insights (rendimiento por anuncio) --------------------------------
// GET /ads devuelve los anuncios de las cuentas conectadas (Meta/TikTok/Google…)
// con métricas reales por ad: inversión, impresiones, clics, CTR, CPC, ROAS, etc.
export type ZernioAdMetrics = {
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  engagement?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  costPerConversion?: number;
  roas?: number;
  purchaseValue?: number;
};
export type ZernioAd = {
  _id?: string;
  platform?: string;
  platformAdId?: string;
  platformCampaignId?: string;
  platformAdSetId?: string;
  platformAdAccountId?: string;
  campaignName?: string;
  adSetName?: string;
  name?: string;
  status?: string;
  platformStatus?: string;
  currency?: string;
  metrics?: ZernioAdMetrics;
};
export type ListAdsResponse = {
  ads: ZernioAd[];
  pagination?: { page: number; limit: number; total: number; pages: number };
};
export async function listAds(params: {
  accountId?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
  platform?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<ListAdsResponse> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return request<ListAdsResponse>("GET", `/ads?${q.toString()}`);
}

// --- Phone numbers (comprar número) ----------------------------------------
export type PurchaseResult = {
  status?: string; // "kyc_required" | "active" | ...
  kycUrl?: string;
  phoneNumber?: string;
  message?: string;
};
export async function purchasePhoneNumber(payload: {
  profileId: string;
  country: string;
  connectWhatsapp?: boolean;
  wantsSms?: boolean;
}): Promise<PurchaseResult> {
  return request("POST", `/phone-numbers/purchase`, payload);
}

// --- Webhooks ---------------------------------------------------------------
export async function registerWebhook(payload: {
  name: string;
  url: string;
  secret: string;
  events: string[];
}) {
  return request<{ success?: boolean; webhook?: { _id: string } }>(
    "POST",
    `/webhooks/settings`,
    payload,
  );
}

export async function listWebhooks() {
  return request<{ webhooks: unknown[] }>("GET", `/webhooks/settings`);
}

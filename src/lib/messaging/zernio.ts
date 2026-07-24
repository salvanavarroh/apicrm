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

export async function listAccounts(profileId?: string) {
  const q = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  return request<{ accounts: unknown[] }>("GET", `/accounts${q}`);
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

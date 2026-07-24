// ============================================================================
// Handlers de eventos de webhook de Zernio. Server-only (admin client).
// Idempotentes y defensivos ante variaciones de shape. Ver §6.2/§6.6 arquitectura.
// ============================================================================

import { normalizeWaId, toE164 } from "@/lib/phone";
import { notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeadForm } from "@/lib/messaging/zernio";
import type { Database } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;
type Json = Record<string, unknown>;
type Platform = Database["public"]["Enums"]["channel_platform"];

const PLATFORM_SOURCE: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

// --- helpers ----------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function getAccountId(payload: Json): string | null {
  const account = payload.account as Json | undefined;
  return (
    str(account?.id) ??
    str(account?.accountId) ??
    str(payload.accountId) ??
    str(payload.account_id)
  );
}

type ChannelRow = {
  id: string;
  company_id: string;
  platform: Platform;
  branch_id: string | null;
  product_type_id: string | null;
  campaign_id: string | null;
};

async function channelByAccount(
  admin: Admin,
  accountId: string,
): Promise<ChannelRow | null> {
  const { data } = await admin
    .from("messaging_channels")
    .select("id, company_id, platform, branch_id, product_type_id, campaign_id")
    .eq("zernio_account_id", accountId)
    .maybeSingle();
  return data ?? null;
}

async function companyCountry(admin: Admin, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  return data?.country ?? null;
}

/** Destinatarios del pool: admins + managers activos de la empresa. */
async function poolRecipients(admin: Admin, companyId: string): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .in("role", ["admin", "manager"])
    .eq("status", "active");
  return (data ?? []).map((p) => p.id);
}

// --- Resolver / crear lead desde un contacto entrante -----------------------

type Participant = {
  phone_e164: string | null;
  bsuid: string | null;
  name: string | null;
  contactId: string | null;
};

async function resolveOrCreateLead(
  admin: Admin,
  channel: ChannelRow,
  p: Participant,
): Promise<{ leadId: string; assignedUserId: string | null }> {
  // 1) Match por phone_e164 (colapsa formatos cross-canal, respeta sticky-seller).
  if (p.phone_e164) {
    const { data: existing } = await admin
      .from("leads")
      .select("id, assigned_user_id")
      .eq("company_id", channel.company_id)
      .eq("phone_e164", p.phone_e164)
      .is("merged_into_id", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { leadId: existing.id, assignedUserId: existing.assigned_user_id };
    }
  }

  // 2) Crear lead nuevo. Pool + claim: queda sin asignar (decisión #1).
  const [first, ...rest] = (p.name ?? "").trim().split(/\s+/);
  const { data: lead } = await admin
    .from("leads")
    .insert({
      company_id: channel.company_id,
      first_name: first || null,
      last_name: rest.length ? rest.join(" ") : null,
      phone_e164: p.phone_e164,
      source: PLATFORM_SOURCE[channel.platform] ?? channel.platform,
      branch_id: channel.branch_id,
      product_type_id: channel.product_type_id,
      campaign_id: channel.campaign_id,
      status: "new",
      metadata: (p.bsuid
        ? { bsuid: p.bsuid, zernio_contact_id: p.contactId }
        : {}) as never,
    })
    .select("id, assigned_user_id")
    .single();

  return { leadId: lead!.id, assignedUserId: lead?.assigned_user_id ?? null };
}

// --- Inbox: message.received / conversation.started -------------------------

export async function handleInboundMessage(payload: Json): Promise<void> {
  const admin = createAdminClient();
  const accountId = getAccountId(payload);
  if (!accountId) return;
  const channel = await channelByAccount(admin, accountId);
  if (!channel) return; // canal no gestionado por el CRM → ignorar

  const message = (payload.message as Json) ?? {};
  const sender = (message.sender as Json) ?? {};
  const zConvId =
    str(message.conversationId) ?? str((payload.conversation as Json)?.id);
  if (!zConvId) return;

  const country = await companyCountry(admin, channel.company_id);
  const rawPhone = str(sender.phoneNumber);
  const phoneE164 =
    channel.platform === "whatsapp"
      ? normalizeWaId(rawPhone, country) ?? toE164(rawPhone, country)
      : toE164(rawPhone, country);

  const participant: Participant = {
    phone_e164: phoneE164,
    bsuid: str(sender.businessScopedUserId),
    name: str(sender.name) ?? str(sender.username),
    contactId: str(sender.contactId),
  };

  // Conversación existente?
  const { data: existingConv } = await admin
    .from("conversations")
    .select("id, lead_id, assigned_user_id")
    .eq("zernio_conversation_id", zConvId)
    .maybeSingle();

  let conversationId: string;
  let assignedUserId: string | null;
  let leadId: string | null;

  if (existingConv) {
    conversationId = existingConv.id;
    assignedUserId = existingConv.assigned_user_id;
    leadId = existingConv.lead_id;
  } else {
    const { leadId: lid, assignedUserId: aid } = await resolveOrCreateLead(
      admin,
      channel,
      participant,
    );
    leadId = lid;
    assignedUserId = aid; // sticky-seller: si el lead ya tiene dueño, la conv va a él
    const attribution = extractAttribution(message);
    const { data: conv } = await admin
      .from("conversations")
      .insert({
        company_id: channel.company_id,
        channel_id: channel.id,
        lead_id: lid,
        zernio_conversation_id: zConvId,
        platform: channel.platform,
        participant_bsuid: participant.bsuid,
        participant_phone_e164: participant.phone_e164,
        participant_name: participant.name,
        participant_handle: str(sender.username),
        zernio_contact_id: participant.contactId,
        assigned_user_id: aid,
        claimed_at: aid ? new Date().toISOString() : null,
        attribution: attribution as never,
      })
      .select("id")
      .single();
    conversationId = conv!.id;
    // La atribución (ctwa_clid / ad) queda en conversations.attribution.
  }

  // Insertar mensaje entrante (idempotente por zernio_message_id).
  const zMsgId = str(message.id) ?? str(message.platformMessageId);
  const body = str(message.text) ?? str((message.text as Json)?.body) ?? null;
  await admin.from("messages").upsert(
    {
      company_id: channel.company_id,
      conversation_id: conversationId,
      zernio_message_id: zMsgId,
      platform_message_id: str(message.platformMessageId),
      direction: "inbound",
      sender_type: "contact",
      message_type: str(message.type) ?? "text",
      body,
      attachments: (message.attachments ?? []) as never,
    },
    { onConflict: "zernio_message_id", ignoreDuplicates: true },
  );

  // Actualizar conversación: ventana 24h, last_inbound, unread, preview.
  const now = new Date();
  const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: cur } = await admin
    .from("conversations")
    .select("unread_count")
    .eq("id", conversationId)
    .maybeSingle();
  await admin
    .from("conversations")
    .update({
      last_inbound_at: now.toISOString(),
      window_expires_at: windowExpires.toISOString(),
      last_message_preview: body?.slice(0, 120) ?? "(adjunto)",
      unread_count: (cur?.unread_count ?? 0) + 1,
      status: "open",
    })
    .eq("id", conversationId);

  // Notificar.
  const link = leadId ? `/admin/leads/${leadId}` : `/admin/inbox`;
  if (assignedUserId) {
    await notify(
      {
        companyId: channel.company_id,
        userId: assignedUserId,
        category: "leads",
        type: "wa_message_received",
        title: `Nuevo mensaje de ${participant.name ?? "un contacto"}`,
        body: body?.slice(0, 100) ?? null,
        link,
        entityType: "lead",
        entityId: leadId,
      },
      admin,
    );
  } else {
    const recipients = await poolRecipients(admin, channel.company_id);
    await notify(
      recipients.map((uid) => ({
        companyId: channel.company_id,
        userId: uid,
        category: "leads" as const,
        type: "wa_message_pool",
        title: `Nuevo lead por ${PLATFORM_SOURCE[channel.platform]}`,
        body: participant.name ?? participant.phone_e164 ?? null,
        link: "/admin/inbox",
        entityType: "lead",
        entityId: leadId,
      })),
      admin,
    );
  }
}

function extractAttribution(message: Json): Json {
  const md = (message.metadata as Json) ?? {};
  const referral = (md.referral as Json) ?? (message.referral as Json) ?? {};
  const out: Json = {};
  const clid = str(md.ctwa_clid) ?? str(referral.ctwa_clid);
  if (clid) out.ctwa_clid = clid;
  const adId = str(referral.source_id) ?? str(referral.ad_id);
  if (adId) out.ad_id = adId;
  return out;
}

// --- Delivery status: message.sent/delivered/read/failed --------------------

const DELIVERY_MAP: Record<string, Database["public"]["Enums"]["message_delivery"]> = {
  "message.sent": "sent",
  "message.delivered": "delivered",
  "message.read": "read",
  "message.failed": "failed",
};

export async function handleDeliveryStatus(
  eventType: string,
  payload: Json,
): Promise<void> {
  const status = DELIVERY_MAP[eventType];
  if (!status) return;
  const admin = createAdminClient();
  const message = (payload.message as Json) ?? {};
  const zMsgId = str(message.id) ?? str(message.platformMessageId);
  if (!zMsgId) return;
  const error = (message.error as Json) ?? {};
  await admin
    .from("messages")
    .update({
      delivery_status: status,
      error_code: str(error.code),
      error_detail: str(error.message) ?? str(error.title),
    })
    .eq("zernio_message_id", zMsgId);
}

// --- Meta Lead Ads: lead.received -------------------------------------------

export async function handleLeadReceived(payload: Json): Promise<void> {
  const admin = createAdminClient();
  const accountId = getAccountId(payload);
  const lead = (payload.lead as Json) ?? {};
  const leadgenId = str(lead.leadgenId) ?? str(lead.id);
  const formId = str(lead.formId);
  if (!accountId) return;

  const channel = await channelByAccount(admin, accountId);
  if (!channel) return;

  // Dedup por leadgenId → leads.external_id.
  if (leadgenId) {
    const { data: dup } = await admin
      .from("leads")
      .select("id")
      .eq("company_id", channel.company_id)
      .eq("external_id", leadgenId)
      .maybeSingle();
    if (dup) return; // ya ingresado
  }

  // Mapeo del formulario (routing + labels de opción múltiple).
  let branchId = channel.branch_id;
  let productTypeId = channel.product_type_id;
  let campaignId = channel.campaign_id;
  let fieldMap: Record<string, string> = {};
  if (formId) {
    const { data: mapping } = await admin
      .from("lead_ad_forms")
      .select("branch_id, product_type_id, campaign_id, field_map")
      .eq("company_id", channel.company_id)
      .eq("meta_form_id", formId)
      .maybeSingle();
    if (mapping) {
      branchId = mapping.branch_id ?? branchId;
      productTypeId = mapping.product_type_id ?? productTypeId;
      campaignId = mapping.campaign_id ?? campaignId;
      fieldMap = (mapping.field_map as Record<string, string>) ?? {};
    }
  }

  const fields = (lead.fields as Record<string, unknown>) ?? {};
  const get = (keys: string[]): string | null => {
    for (const k of keys) {
      const v = fields[k];
      if (typeof v === "string" && v) return v;
      const mapped = Object.entries(fieldMap).find(([, dest]) => dest === k)?.[0];
      if (mapped && typeof fields[mapped] === "string") return fields[mapped] as string;
    }
    return null;
  };

  const country = await companyCountry(admin, channel.company_id);
  const rawPhone = get(["phone", "phone_number", "telefono"]);
  const fullName = get(["full_name", "name", "nombre"]);
  const [first, ...rest] = (fullName ?? "").trim().split(/\s+/);

  const { data: newLead } = await admin
    .from("leads")
    .insert({
      company_id: channel.company_id,
      first_name: first || null,
      last_name: rest.length ? rest.join(" ") : null,
      email: get(["email", "correo"]),
      phone: rawPhone,
      phone_e164: toE164(rawPhone, country),
      city: get(["city", "ciudad"]),
      vehicle_model: get(["vehicle", "modelo", "vehicle_model"]),
      source: "Meta Lead Ads",
      external_id: leadgenId,
      source_created_at: str(lead.createdAt) ?? str(lead.createdTime),
      metadata: {
        adId: lead.adId ?? null,
        adsetId: lead.adsetId ?? null,
        campaignId: lead.campaignId ?? null,
        formId,
        isOrganic: lead.isOrganic ?? null,
      } as never,
      branch_id: branchId,
      product_type_id: productTypeId,
      campaign_id: campaignId,
      status: "new",
    })
    .select("id")
    .single();

  if (!newLead) return;

  // Routing: si hay sucursal+tipo, auto-asigna; si no, pool.
  if (branchId && productTypeId) {
    await admin.rpc("auto_assign_lead", { p_lead_id: newLead.id });
  }

  const recipients = await poolRecipients(admin, channel.company_id);
  await notify(
    recipients.map((uid) => ({
      companyId: channel.company_id,
      userId: uid,
      category: "leads" as const,
      type: "lead_ad_received",
      title: "Nuevo lead de Meta Lead Ads",
      body: fullName ?? rawPhone ?? null,
      link: `/admin/leads/${newLead.id}`,
      entityType: "lead",
      entityId: newLead.id,
    })),
    admin,
  );
  void getLeadForm; // reservado para cachear labels de opción múltiple
}

// --- Account connected / disconnected ---------------------------------------

export async function handleAccountConnected(payload: Json): Promise<void> {
  const admin = createAdminClient();
  const account = (payload.account as Json) ?? {};
  const accountId = str(account.accountId) ?? str(account.id);
  const profileId = str(account.profileId);
  if (!accountId || !profileId) return;

  // Buscar la empresa por su zernio_profile_id.
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("zernio_profile_id", profileId)
    .maybeSingle();
  if (!company) return;

  await admin
    .from("messaging_channels")
    .update({
      status: "active",
      external_ref: str(account.username),
      display_name: str(account.displayName) ?? str(account.username),
      connected_at: new Date().toISOString(),
    })
    .eq("zernio_account_id", accountId)
    .eq("company_id", company.id);
}

export async function handleAccountDisconnected(payload: Json): Promise<void> {
  const admin = createAdminClient();
  const account = (payload.account as Json) ?? {};
  const accountId = str(account.accountId) ?? str(account.id);
  if (!accountId) return;
  await admin
    .from("messaging_channels")
    .update({ status: "disconnected" })
    .eq("zernio_account_id", accountId);
}

// --- Template status --------------------------------------------------------

export async function handleTemplateStatus(payload: Json): Promise<void> {
  const admin = createAdminClient();
  const template = (payload.template as Json) ?? {};
  const name = str(template.name);
  const status = str(template.status);
  if (!name || !status) return;
  await admin
    .from("whatsapp_templates")
    .update({
      status,
      rejection_reason: str(template.reason),
    })
    .eq("zernio_template_name", name);
}

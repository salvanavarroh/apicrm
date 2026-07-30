"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { maybeAdvanceStatus } from "@/lib/lead-status";
import { markRead, sendInboxMessage, startConversation } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

const ROLES = ["admin", "manager", "supervisor", "sales"] as const;
const PRIV_ROLES = ["admin", "manager", "supervisor"] as const;

// --- Panel de info del lead ------------------------------------------------
export type LeadInfo = {
  id: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  city: string | null;
  vehicle: string | null;
  status: string;
  temperature: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  assigned_name: string | null;
  campaign_name: string | null;
  created_at: string;
};

export async function getLeadInfo(leadId: string): Promise<LeadInfo | null> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data: l } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, phone, phone_e164, email, city, vehicle_brand, vehicle_model, vehicle_version, status, temperature, source, budget_min, budget_max, created_at, assigned_user_id, campaign:campaigns!campaign_id (name)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!l) return null;

  let assignedName: string | null = null;
  if (l.assigned_user_id) {
    const { data: v } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", l.assigned_user_id)
      .maybeSingle();
    if (v) assignedName = fullName(v.first_name, v.last_name);
  }

  const vehicle =
    [l.vehicle_brand, l.vehicle_model, l.vehicle_version].filter(Boolean).join(" ") ||
    null;

  return {
    id: l.id,
    name: fullName(l.first_name, l.last_name),
    phone: l.phone,
    phone_e164: l.phone_e164,
    email: l.email,
    city: l.city,
    vehicle,
    status: l.status,
    temperature: l.temperature,
    source: l.source,
    budget_min: l.budget_min,
    budget_max: l.budget_max,
    assigned_name: assignedName,
    campaign_name: (l.campaign as { name: string } | null)?.name ?? null,
    created_at: l.created_at,
  };
}

// --- Quick actions sobre el lead -------------------------------------------
export async function quickUpdateLead(
  leadId: string,
  patch: { status?: string; temperature?: string | null },
): Promise<Result> {
  const profile = await requireRole([...ROLES]);
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.company_id !== profile.company_id) {
    return { ok: false, message: "Lead no encontrado" };
  }
  const upd: Record<string, unknown> = {};
  if (patch.status) upd.status = patch.status;
  if (patch.temperature !== undefined) {
    upd.temperature = patch.temperature;
    upd.temperature_set_at = new Date().toISOString();
  }
  await admin.from("leads").update(upd as never).eq("id", leadId);
  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function quickAddNote(leadId: string, content: string): Promise<Result> {
  const profile = await requireRole([...ROLES]);
  const body = content.trim();
  if (!body) return { ok: false, message: "Nota vacía" };
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.company_id !== profile.company_id) {
    return { ok: false, message: "Lead no encontrado" };
  }
  await admin.from("lead_notes").insert({
    lead_id: leadId,
    company_id: profile.company_id!,
    author_id: profile.id,
    content: body,
    activity_type: "other",
  });
  revalidatePath("/admin/inbox");
  return { ok: true };
}

// --- Plantillas aprobadas (para enviar desde el header) --------------------
export type TemplateVar = { pos: number; label: string };
export type ApprovedTemplate = {
  name: string;
  language: string;
  body_preview: string | null;
  variables: TemplateVar[];
};

// Deriva las variables de la plantilla: primero de la metadata `variables`
// (`[{pos, maps_to}]`), y si no viene, contando los `{{n}}` del preview.
function templateVars(variables: unknown, bodyPreview: string | null): TemplateVar[] {
  const out: TemplateVar[] = [];
  if (Array.isArray(variables)) {
    for (const v of variables as Array<{ pos?: number; maps_to?: string }>) {
      if (typeof v?.pos === "number") {
        out.push({
          pos: v.pos,
          label:
            typeof v.maps_to === "string" && v.maps_to ? v.maps_to : `Variable ${v.pos}`,
        });
      }
    }
  }
  if (out.length === 0 && bodyPreview) {
    const positions = new Set<number>();
    for (const m of bodyPreview.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
      positions.add(Number(m[1]));
    }
    for (const p of Array.from(positions).sort((a, b) => a - b)) {
      out.push({ pos: p, label: `Variable ${p}` });
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

// Sustituye los `{{n}}` del preview con los valores dados (en orden por pos).
function substituteVars(preview: string, params: string[]): string {
  return preview.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const val = params[Number(n) - 1];
    return val != null && val !== "" ? val : `{{${n}}}`;
  });
}

export async function listApprovedTemplates(): Promise<ApprovedTemplate[]> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("zernio_template_name, language, body_preview, variables")
    .eq("company_id", profile.company_id!)
    .eq("status", "APPROVED")
    .order("zernio_template_name");
  return (data ?? []).map((t) => ({
    name: t.zernio_template_name,
    language: t.language,
    body_preview: t.body_preview,
    variables: templateVars(t.variables, t.body_preview),
  }));
}

// --- Insights del inbox (admin/manager) ------------------------------------
export type InboxInsights = {
  total: number;
  pool: number;
  assigned: number;
  unanswered: number;
  windowClosing: number;
  byPlatform: { platform: string; count: number }[];
  byVendor: { name: string; assigned: number; unanswered: number }[];
};

export async function getInboxInsights(): Promise<InboxInsights | null> {
  await requireRole([...PRIV_ROLES]);
  const supabase = await createClient();
  const { data: convs } = await supabase
    .from("conversations")
    .select("assigned_user_id, platform, unread_count, window_expires_at, status")
    .neq("status", "closed")
    .limit(2000);
  const rows = convs ?? [];

  // Nombres de vendedores.
  const vendorIds = Array.from(
    new Set(rows.map((r) => r.assigned_user_id).filter(Boolean)),
  ) as string[];
  const names = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vs } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", vendorIds);
    for (const v of vs ?? []) names.set(v.id, fullName(v.first_name, v.last_name));
  }

  const now = Date.now();
  const soon = now + 60 * 60 * 1000;
  let pool = 0;
  let assigned = 0;
  let unanswered = 0;
  let windowClosing = 0;
  const byPlat = new Map<string, number>();
  const byVend = new Map<string, { assigned: number; unanswered: number }>();

  for (const r of rows) {
    byPlat.set(r.platform, (byPlat.get(r.platform) ?? 0) + 1);
    const unread = (r.unread_count ?? 0) > 0;
    if (unread) unanswered++;
    const exp = r.window_expires_at ? new Date(r.window_expires_at).getTime() : 0;
    if (exp > now && exp < soon) windowClosing++;
    if (!r.assigned_user_id) {
      pool++;
    } else {
      assigned++;
      const key = r.assigned_user_id;
      const cur = byVend.get(key) ?? { assigned: 0, unanswered: 0 };
      cur.assigned++;
      if (unread) cur.unanswered++;
      byVend.set(key, cur);
    }
  }

  return {
    total: rows.length,
    pool,
    assigned,
    unanswered,
    windowClosing,
    byPlatform: Array.from(byPlat, ([platform, count]) => ({ platform, count })).sort(
      (a, b) => b.count - a.count,
    ),
    byVendor: Array.from(byVend, ([id, v]) => ({
      name: names.get(id) ?? "—",
      assigned: v.assigned,
      unanswered: v.unanswered,
    })).sort((a, b) => b.assigned - a.assigned),
  };
}

export type Attachment = {
  url?: string;
  type?: string; // audio | image | video | file | document | unsupported_type
  payload?: { mimeType?: string; id?: string; url?: string } | null;
  localUrl?: string; // sólo cliente: preview optimista (objectURL) antes de subir
};
export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  delivery_status: string;
  created_at: string;
  sent_by_user_id: string | null;
  attachments: Attachment[];
};

/** Mensajes de una conversación (RLS decide si el usuario la ve). */
export async function getMessages(conversationId: string): Promise<InboxMessage[]> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(
      "id, direction, body, message_type, delivery_status, created_at, sent_by_user_id, attachments",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  // Marcar leído (best-effort) al abrir.
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);

  // Read receipts (tildes azules): avisar a Zernio que el contacto fue leído.
  // Best-effort: no bloqueamos la carga de mensajes si la API falla.
  try {
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select(
        "zernio_conversation_id, channel:messaging_channels!channel_id (zernio_account_id)",
      )
      .eq("id", conversationId)
      .maybeSingle();
    const accountId = (conv?.channel as { zernio_account_id: string } | null)
      ?.zernio_account_id;
    if (conv?.zernio_conversation_id && accountId && !accountId.startsWith("mock_")) {
      await markRead(conv.zernio_conversation_id, accountId);
    }
  } catch {
    /* best-effort: la marca de leído no debe romper la apertura del chat */
  }

  return (data ?? []).map((m) => ({
    ...m,
    attachments: Array.isArray(m.attachments) ? (m.attachments as Attachment[]) : [],
  })) as InboxMessage[];
}

/** Toma una conversación del pool (claim atómico + asignación del lead). */
export async function claimConversation(conversationId: string): Promise<Result> {
  const profile = await requireRole([...ROLES]);
  const admin = createAdminClient();

  // Claim atómico: sólo si sigue sin asignar.
  const { data: claimed } = await admin
    .from("conversations")
    .update({ assigned_user_id: profile.id, claimed_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("company_id", profile.company_id!)
    .is("assigned_user_id", null)
    .select("id, lead_id")
    .maybeSingle();

  if (!claimed) {
    // Ya estaba asignada: ¿a mí o a otro?
    const { data: conv } = await admin
      .from("conversations")
      .select("assigned_user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv?.assigned_user_id === profile.id) {
      return { ok: true }; // ya es mía → no es error
    }
    let who = "otro vendedor";
    if (conv?.assigned_user_id) {
      const { data: v } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", conv.assigned_user_id)
        .maybeSingle();
      if (v) who = fullName(v.first_name, v.last_name);
    }
    return { ok: false, message: `La tomó ${who}` };
  }
  // Asignar el lead si estaba sin dueño (sticky-seller de acá en más).
  if (claimed.lead_id) {
    await admin
      .from("leads")
      .update({ assigned_user_id: profile.id, assigned_at: new Date().toISOString() })
      .eq("id", claimed.lead_id)
      .is("assigned_user_id", null);
  }
  revalidatePath("/admin/inbox");
  return { ok: true };
}

/**
 * Reasigna/transfiere una conversación a otro vendedor. Solo roles privilegiados
 * (admin/manager/supervisor). Reasigna también el lead vinculado (sticky-seller).
 */
export async function reassignConversation(
  conversationId: string,
  toUserId: string,
): Promise<Result> {
  const profile = await requireRole([...PRIV_ROLES]);
  const admin = createAdminClient();

  // La conversación debe ser de la empresa del que reasigna.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, lead_id")
    .eq("id", conversationId)
    .eq("company_id", profile.company_id!)
    .maybeSingle();
  if (!conv) return { ok: false, message: "Conversación no encontrada" };

  // El destinatario debe ser un usuario activo de la misma empresa.
  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", toUserId)
    .eq("company_id", profile.company_id!)
    .eq("status", "active")
    .maybeSingle();
  if (!target) return { ok: false, message: "Vendedor no válido" };

  const now = new Date().toISOString();
  await admin
    .from("conversations")
    .update({ assigned_user_id: toUserId, claimed_at: now })
    .eq("id", conversationId);

  // Reasignar el lead vinculado para que quede con el mismo dueño.
  if (conv.lead_id) {
    await admin
      .from("leads")
      .update({ assigned_user_id: toUserId, assigned_at: now })
      .eq("id", conv.lead_id);
  }

  revalidatePath("/admin/inbox");
  return { ok: true };
}

async function loadConversationForSend(conversationId: string, companyId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select(
      "id, company_id, lead_id, assigned_user_id, zernio_conversation_id, window_expires_at, participant_phone_e164, channel:messaging_channels!channel_id (zernio_account_id)",
    )
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  return data;
}

type MediaKind = "image" | "video" | "audio" | "file";
function mediaKind(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // 25MB (límite del bucket)

/**
 * Envía un adjunto (imagen/audio/video/archivo) por el inbox. Sube el archivo al
 * bucket público `inbox-outbound`, se lo pasa a Zernio por URL (que lo reenvía a
 * WhatsApp/Meta) y guarda el mensaje con el adjunto. El caption es opcional.
 */
export async function sendAttachment(
  conversationId: string,
  formData: FormData,
): Promise<Result<{ messageId: string }>> {
  const profile = await requireRole([...ROLES]);
  const admin = createAdminClient();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Archivo vacío" };
  }
  if (file.size > MAX_ATTACH_BYTES) {
    return { ok: false, message: "El archivo supera los 25MB" };
  }
  const caption = ((formData.get("caption") as string | null) ?? "").trim() || null;

  const conv = await loadConversationForSend(conversationId, profile.company_id!);
  if (!conv) return { ok: false, message: "Conversación no encontrada" };

  const isPrivileged = ["admin", "manager", "supervisor"].includes(profile.role);
  if (!isPrivileged && conv.assigned_user_id !== profile.id) {
    return { ok: false, message: "Tomá la conversación antes de responder" };
  }
  const expired =
    !conv.window_expires_at || new Date(conv.window_expires_at) < new Date();
  if (expired) {
    return {
      ok: false,
      message: "La ventana de 24h expiró. Usá una plantilla aprobada para reabrir.",
    };
  }
  const accountId = (conv.channel as { zernio_account_id: string } | null)
    ?.zernio_account_id;
  if (!accountId) return { ok: false, message: "Canal sin cuenta" };

  const mime = file.type || "application/octet-stream";
  const base = mime.split(";")[0].trim();
  // Formatos que aceptan a la vez WhatsApp e Instagram (audio ya viene como m4a).
  const ALLOWED = new Set([
    "image/png",
    "image/jpeg",
    "video/mp4",
    "application/pdf",
    "audio/mp4",
    "audio/aac",
    "audio/x-m4a",
    "audio/m4a",
  ]);
  if (!ALLOWED.has(base)) {
    return { ok: false, message: "Formato de archivo no soportado" };
  }
  const kind = mediaKind(mime);
  const ext =
    (file.name.includes(".") ? file.name.split(".").pop() : mime.split("/")[1]) ||
    "bin";
  const path = `${profile.company_id}/${conversationId}/${crypto.randomUUID()}.${ext}`;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const up = await admin.storage
      .from("inbox-outbound")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) {
      return { ok: false, message: `No se pudo subir el archivo: ${up.error.message}` };
    }
    const publicUrl = admin.storage.from("inbox-outbound").getPublicUrl(path)
      .data.publicUrl;

    // Envío por Zernio (los canales mock no pegan a la API).
    let zMsgId: string | null = null;
    if (accountId.startsWith("mock_")) {
      zMsgId = `mock_out_${Date.now()}`;
    } else {
      const res = await sendInboxMessage(conv.zernio_conversation_id, {
        accountId,
        message: caption ?? undefined,
        attachmentUrl: publicUrl,
        attachmentType: kind,
        attachmentName: file.name,
      });
      zMsgId = res.data?.messageId ?? null;
    }

    const { data: msg } = await admin
      .from("messages")
      .insert({
        company_id: profile.company_id!,
        conversation_id: conversationId,
        zernio_message_id: zMsgId,
        direction: "outbound",
        sender_type: "agent",
        sent_by_user_id: profile.id,
        message_type: kind,
        body: caption,
        attachments: [{ url: publicUrl, type: kind, payload: { mimeType: mime } }] as never,
        delivery_status: accountId.startsWith("mock_") ? "delivered" : "sent",
      })
      .select("id")
      .single();

    const preview =
      caption ??
      { image: "📷 Imagen", audio: "🎤 Audio", video: "🎬 Video", file: "📎 Archivo" }[kind];
    await admin
      .from("conversations")
      .update({
        last_outbound_at: new Date().toISOString(),
        last_message_preview: preview,
        unread_count: 0,
      })
      .eq("id", conversationId);

    if (conv.lead_id) {
      await admin.from("lead_notes").insert({
        lead_id: conv.lead_id,
        company_id: profile.company_id!,
        author_id: profile.id,
        content: caption ?? `[${kind}]`,
        activity_type: "whatsapp",
      });
      await maybeAdvanceStatus(admin, conv.lead_id, "contacted");
    }

    revalidatePath("/admin/inbox");
    return { ok: true, messageId: msg!.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error enviando adjunto" };
  }
}

/** Envía un mensaje de texto (dentro de la ventana de 24h). */
export async function sendMessage(
  conversationId: string,
  text: string,
): Promise<Result<{ messageId: string }>> {
  const profile = await requireRole([...ROLES]);
  const admin = createAdminClient();
  const body = text.trim();
  if (!body) return { ok: false, message: "Mensaje vacío" };

  const conv = await loadConversationForSend(conversationId, profile.company_id!);
  if (!conv) return { ok: false, message: "Conversación no encontrada" };

  // Autorización: dueño de la conversación o superior.
  const isPrivileged = ["admin", "manager", "supervisor"].includes(profile.role);
  if (!isPrivileged && conv.assigned_user_id !== profile.id) {
    return { ok: false, message: "Tomá la conversación antes de responder" };
  }

  // Ventana de 24h.
  const expired =
    !conv.window_expires_at || new Date(conv.window_expires_at) < new Date();
  if (expired) {
    return {
      ok: false,
      message: "La ventana de 24h expiró. Usá una plantilla aprobada para reabrir.",
    };
  }

  const accountId = (conv.channel as { zernio_account_id: string } | null)
    ?.zernio_account_id;
  if (!accountId) return { ok: false, message: "Canal sin cuenta" };

  try {
    // Canales mock (seed de prueba): simulamos el envío sin pegarle a Zernio.
    let zMsgId: string | null = null;
    if (accountId.startsWith("mock_")) {
      zMsgId = `mock_out_${Date.now()}`;
    } else {
      const res = await sendInboxMessage(conv.zernio_conversation_id, {
        accountId,
        message: body,
      });
      zMsgId = res.data?.messageId ?? null;
    }
    const { data: msg } = await admin
      .from("messages")
      .insert({
        company_id: profile.company_id!,
        conversation_id: conversationId,
        zernio_message_id: zMsgId,
        direction: "outbound",
        sender_type: "agent",
        sent_by_user_id: profile.id,
        message_type: "text",
        body,
        delivery_status: accountId.startsWith("mock_") ? "delivered" : "sent",
      })
      .select("id")
      .single();

    await admin
      .from("conversations")
      .update({
        last_outbound_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 120),
        unread_count: 0,
      })
      .eq("id", conversationId);

    // Registrar actividad → avanza pipeline (reusa lo existente).
    if (conv.lead_id) {
      await admin.from("lead_notes").insert({
        lead_id: conv.lead_id,
        company_id: profile.company_id!,
        author_id: profile.id,
        content: body,
        activity_type: "whatsapp",
      });
      await maybeAdvanceStatus(admin, conv.lead_id, "contacted");
    }

    revalidatePath("/admin/inbox");
    return { ok: true, messageId: msg!.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error enviando" };
  }
}

/** Envía una plantilla aprobada para reabrir fuera de la ventana. */
export async function sendTemplateMessage(
  conversationId: string,
  templateName: string,
  language: string,
  params: string[] = [],
): Promise<Result<{ messageId: string }>> {
  const profile = await requireRole([...ROLES]);
  const admin = createAdminClient();

  const conv = await loadConversationForSend(conversationId, profile.company_id!);
  if (!conv) return { ok: false, message: "Conversación no encontrada" };
  const isPrivileged = ["admin", "manager", "supervisor"].includes(profile.role);
  if (!isPrivileged && conv.assigned_user_id !== profile.id) {
    return { ok: false, message: "Tomá la conversación antes de responder" };
  }
  const accountId = (conv.channel as { zernio_account_id: string } | null)
    ?.zernio_account_id;
  const to = conv.participant_phone_e164?.replace(/[^\d]/g, "");
  if (!accountId || !to) return { ok: false, message: "Faltan datos del canal" };

  // Texto final que se muestra en la burbuja: sustituimos las variables en el
  // preview de la plantilla (para mock y para reales, así el chat muestra lo que
  // realmente se envió). Fallback al nombre de la plantilla si no hay preview.
  const { data: tpl } = await admin
    .from("whatsapp_templates")
    .select("body_preview")
    .eq("company_id", profile.company_id!)
    .eq("zernio_template_name", templateName)
    .eq("language", language)
    .maybeSingle();
  const bodyText = tpl?.body_preview
    ? substituteVars(tpl.body_preview, params)
    : `[plantilla: ${templateName}]`;

  try {
    let zMsgId: string | null = null;
    if (accountId.startsWith("mock_")) {
      zMsgId = `mock_tpl_${Date.now()}`;
    } else {
      const res = await startConversation({
        accountId,
        participantId: to,
        templateName,
        templateLanguage: language,
        templateParams: params,
      });
      zMsgId = res.data?.messageId ?? null;
    }
    const { data: msg } = await admin
      .from("messages")
      .insert({
        company_id: profile.company_id!,
        conversation_id: conversationId,
        zernio_message_id: zMsgId,
        direction: "outbound",
        sender_type: "agent",
        sent_by_user_id: profile.id,
        message_type: "template",
        template_name: templateName,
        body: bodyText,
        delivery_status: "sent",
      })
      .select("id")
      .single();
    await admin
      .from("conversations")
      .update({ last_outbound_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (conv.lead_id) {
      await admin.from("lead_notes").insert({
        lead_id: conv.lead_id,
        company_id: profile.company_id!,
        author_id: profile.id,
        content: `Plantilla enviada: ${templateName}`,
        activity_type: "whatsapp",
      });
      await maybeAdvanceStatus(admin, conv.lead_id, "contacted");
    }
    revalidatePath("/admin/inbox");
    return { ok: true, messageId: msg!.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error enviando" };
  }
}

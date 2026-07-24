"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { maybeAdvanceStatus } from "@/lib/lead-status";
import { sendInboxMessage, startConversation } from "@/lib/messaging/zernio";
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
export type ApprovedTemplate = {
  name: string;
  language: string;
  body_preview: string | null;
};
export async function listApprovedTemplates(): Promise<ApprovedTemplate[]> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("zernio_template_name, language, body_preview")
    .eq("company_id", profile.company_id!)
    .eq("status", "APPROVED")
    .order("zernio_template_name");
  return (data ?? []).map((t) => ({
    name: t.zernio_template_name,
    language: t.language,
    body_preview: t.body_preview,
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

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  delivery_status: string;
  created_at: string;
  sent_by_user_id: string | null;
};

/** Mensajes de una conversación (RLS decide si el usuario la ve). */
export async function getMessages(conversationId: string): Promise<InboxMessage[]> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, direction, body, message_type, delivery_status, created_at, sent_by_user_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  // Marcar leído (best-effort) al abrir.
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
  return (data ?? []) as InboxMessage[];
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
    return { ok: false, message: "La tomó otro vendedor" };
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
        body: `[plantilla: ${templateName}]`,
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

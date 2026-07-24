"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { maybeAdvanceStatus } from "@/lib/lead-status";
import { sendInboxMessage, startConversation } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

const ROLES = ["admin", "manager", "supervisor", "sales"] as const;

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

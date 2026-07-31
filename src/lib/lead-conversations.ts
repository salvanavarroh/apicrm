// Conversaciones (WhatsApp/IG/FB) de un lead + últimos mensajes, para la sección
// "Mensajes" del detalle del lead. Usa el admin client scopeado al lead (la página
// ya autorizó ver el lead vía RLS), evitando dudas de RLS sobre conversations.

import { createAdminClient } from "@/lib/supabase/admin";

export type LeadMessagePreview = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  created_at: string;
  sent_by_user_id: string | null;
};

export type LeadConversation = {
  id: string;
  platform: string;
  participant_name: string | null;
  participant_handle: string | null;
  participant_phone_e164: string | null;
  unread_count: number;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  messages: LeadMessagePreview[];
};

const RECENT_PER_CONVERSATION = 6;

export async function loadLeadConversations(
  leadId: string,
  companyId: string,
): Promise<LeadConversation[]> {
  const admin = createAdminClient();
  const { data: convs } = await admin
    .from("conversations")
    .select(
      "id, platform, participant_name, participant_handle, participant_phone_e164, unread_count, last_message_preview, last_inbound_at, window_expires_at",
    )
    .eq("lead_id", leadId)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (!convs || convs.length === 0) return [];

  const out: LeadConversation[] = [];
  for (const c of convs) {
    const { data: msgs } = await admin
      .from("messages")
      .select("id, direction, body, message_type, created_at, sent_by_user_id")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_PER_CONVERSATION);
    out.push({
      ...c,
      unread_count: c.unread_count ?? 0,
      messages: ((msgs ?? []) as LeadMessagePreview[]).slice().reverse(),
    });
  }
  return out;
}

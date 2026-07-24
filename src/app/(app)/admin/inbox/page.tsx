import { requireRole } from "@/lib/auth";
import { InboxView, type ConversationListItem } from "@/components/inbox/inbox-view";
import { createClient } from "@/lib/supabase/server";

export default async function AdminInboxPage() {
  const profile = await requireRole(["admin", "manager", "supervisor", "sales"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, platform, participant_name, participant_phone_e164, assigned_user_id, status, unread_count, last_message_preview, last_inbound_at, window_expires_at, lead_id, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  const conversations = (data ?? []) as ConversationListItem[];

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Conversaciones de WhatsApp, Instagram y Facebook. Tomá una del pool y
          respondé desde acá.
        </p>
      </header>
      <InboxView conversations={conversations} currentUserId={profile.id} />
    </div>
  );
}

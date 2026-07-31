import { requireRole } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import {
  InboxView,
  type ConversationListItem,
  type VendorOption,
} from "@/components/inbox/inbox-view";
import { createClient } from "@/lib/supabase/server";

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const profile = await requireRole(["admin", "manager", "supervisor", "sales"]);
  const supabase = await createClient();
  const { c: initialConversationId } = await searchParams;

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, platform, participant_name, participant_phone_e164, participant_handle, participant_photo_url, assigned_user_id, status, unread_count, last_message_preview, last_inbound_at, last_outbound_at, window_expires_at, lead_id, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];

  // Nombres de vendedores asignados + lista para el filtro.
  const assignedIds = Array.from(
    new Set(rows.map((r) => r.assigned_user_id).filter(Boolean)),
  ) as string[];
  const nameMap = new Map<string, string>();
  if (assignedIds.length) {
    const { data: vs } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", assignedIds);
    for (const v of vs ?? []) nameMap.set(v.id, fullName(v.first_name, v.last_name));
  }

  const { data: vendorProfiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("company_id", profile.company_id!)
    .in("role", ["sales", "manager", "supervisor"])
    .eq("status", "active");
  const vendors: VendorOption[] = (vendorProfiles ?? []).map((v) => ({
    id: v.id,
    name: fullName(v.first_name, v.last_name),
  }));

  const conversations: ConversationListItem[] = rows.map((c) => ({
    ...c,
    assigned_name: c.assigned_user_id ? (nameMap.get(c.assigned_user_id) ?? null) : null,
  }));

  const isPriv = ["admin", "manager", "supervisor"].includes(profile.role);

  return (
    <InboxView
      conversations={conversations}
      currentUserId={profile.id}
      isPriv={isPriv}
      vendors={vendors}
      initialConversationId={initialConversationId ?? null}
    />
  );
}

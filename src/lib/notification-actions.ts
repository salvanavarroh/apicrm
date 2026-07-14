"use server";

// Acciones de notificaciones para la campanita (lectura + marcar leídas).
// Todo scopeado por RLS al usuario actual.

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  category: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  await requireProfile();
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, category, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  return { items: data ?? [], unread: count ?? 0 };
}

export async function markNotificationRead(
  id: string,
): Promise<{ ok: boolean }> {
  await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  await requireProfile();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return { ok: true };
}

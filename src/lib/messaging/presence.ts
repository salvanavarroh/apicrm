// Presencia del call center: si el vendedor está "Activo" (y fresco por heartbeat)
// y cuántos vendedores hay activos en la empresa. Admin client (scopeado a la
// empresa del usuario). La ventana de frescura debe coincidir con la del round-
// robin (assign_conversation_to_active_vendor: 15 min).

import { createAdminClient } from "@/lib/supabase/admin";

const STALE_MS = 15 * 60 * 1000;

export async function loadInboxPresence(
  userId: string,
  companyId: string,
): Promise<{ available: boolean; activeCount: number }> {
  const admin = createAdminClient();
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const [{ data: me }, { count }] = await Promise.all([
    admin
      .from("profiles")
      .select("inbox_available, inbox_available_at")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("role", "sales")
      .eq("status", "active")
      .eq("inbox_available", true)
      .gt("inbox_available_at", staleIso),
  ]);
  const available = !!(
    me?.inbox_available &&
    me.inbox_available_at &&
    me.inbox_available_at > staleIso
  );
  return { available, activeCount: count ?? 0 };
}

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

export type InboxPresenceStats = {
  available: boolean;
  activeCount: number;
  /** Conversaciones mías abiertas. */
  open: number;
  /** Mías con mensajes del cliente sin responder. */
  unanswered: number;
  /** Sin asignar en toda la empresa: las que esperan que alguien se active. */
  pool: number;
  /** Mías con la ventana de 24h de WhatsApp por cerrarse en menos de 4h. */
  closingWindow: number;
};

const CLOSING_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Presencia + los contadores que le importan al vendedor cuando abre su inicio:
 * qué tiene sin responder, qué se le está por vencer y cuántas están esperando
 * en el pool (que es el argumento para activarse).
 *
 * Todo se cuenta en la DB con `count: exact, head: true`: son 4 queries
 * paralelas sobre índices que ya existen, sin traer una sola fila.
 */
export async function loadInboxPresenceStats(
  userId: string,
  companyId: string,
): Promise<InboxPresenceStats> {
  const admin = createAdminClient();
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const closingIso = new Date(Date.now() + CLOSING_WINDOW_MS).toISOString();
  const nowIso = new Date().toISOString();

  const mine = () =>
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("assigned_user_id", userId);

  const [
    { data: me },
    activeRes,
    openRes,
    unansweredRes,
    poolRes,
    closingRes,
  ] = await Promise.all([
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
    mine().eq("status", "open"),
    mine().eq("status", "open").gt("unread_count", 0),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "open")
      .is("assigned_user_id", null),
    mine()
      .eq("status", "open")
      .gt("window_expires_at", nowIso)
      .lt("window_expires_at", closingIso),
  ]);

  return {
    available: !!(
      me?.inbox_available &&
      me.inbox_available_at &&
      me.inbox_available_at > staleIso
    ),
    activeCount: activeRes.count ?? 0,
    open: openRes.count ?? 0,
    unanswered: unansweredRes.count ?? 0,
    pool: poolRes.count ?? 0,
    closingWindow: closingRes.count ?? 0,
  };
}

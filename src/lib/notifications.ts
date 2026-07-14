// ============================================================================
// Notificaciones: helper para crear notificaciones (server-only, admin client)
// y resolver destinatarios. Alimenta la campanita y los contadores del menú.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type NotifyCategory = "sales" | "leads" | "tasks" | "other";

export type NotifyInput = {
  companyId: string;
  userId: string; // destinatario
  category: NotifyCategory;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

/** Inserta una o varias notificaciones (bypass RLS con el admin client). */
export async function notify(
  inputs: NotifyInput | NotifyInput[],
  admin?: Admin,
): Promise<void> {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0) return;
  const client = admin ?? createAdminClient();
  await client.from("notifications").insert(
    list.map((i) => ({
      company_id: i.companyId,
      user_id: i.userId,
      category: i.category,
      type: i.type,
      title: i.title,
      body: i.body ?? null,
      link: i.link ?? null,
      entity_type: i.entityType ?? null,
      entity_id: i.entityId ?? null,
    })),
  );
}

/**
 * Usuarios que aprueban una venta de un lead: los gerentes de la(s) gerencia(s)
 * (sucursal + tipo de producto del lead) y sus supervisores. Activos.
 */
export async function approverIdsForLead(
  leadId: string,
  admin?: Admin,
): Promise<string[]> {
  const client = admin ?? createAdminClient();
  const { data: lead } = await client
    .from("leads")
    .select("branch_id, product_type_id, company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.branch_id || !lead.product_type_id) return [];

  const { data: mgmts } = await client
    .from("managements")
    .select("manager_id")
    .eq("branch_id", lead.branch_id)
    .eq("product_type_id", lead.product_type_id);
  const managerIds = Array.from(
    new Set((mgmts ?? []).map((m) => m.manager_id).filter(Boolean)),
  ) as string[];
  if (managerIds.length === 0) return [];

  // Gerentes + supervisores (bajo esos gerentes), activos.
  const [{ data: managers }, { data: supervisors }] = await Promise.all([
    client
      .from("profiles")
      .select("id")
      .in("id", managerIds)
      .eq("role", "manager")
      .eq("status", "active"),
    client
      .from("profiles")
      .select("id")
      .in("manager_id", managerIds)
      .eq("role", "supervisor")
      .eq("status", "active"),
  ]);

  return Array.from(
    new Set([
      ...(managers ?? []).map((m) => m.id),
      ...(supervisors ?? []).map((s) => s.id),
    ]),
  );
}

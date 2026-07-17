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
 * Usuarios que aprueban la venta de un vendedor: su GERENTE (el jefe al que
 * reporta, profiles.manager_id) y los supervisores bajo ese gerente. Activos.
 *
 * Basado en la jerarquía real vendedor→gerente (no en la gerencia sucursal×tipo
 * del lead, que puede no existir y dejaba al vendedor sin aprobador). Es la
 * misma relación que usan las policies RLS de `sales` para el gerente.
 */
export async function approverIdsForVendor(
  vendorId: string,
  admin?: Admin,
): Promise<string[]> {
  const client = admin ?? createAdminClient();
  const { data: vendor } = await client
    .from("profiles")
    .select("manager_id")
    .eq("id", vendorId)
    .maybeSingle();
  const directManagerId = vendor?.manager_id;
  if (!directManagerId) return [];

  // El manager_id del vendedor puede apuntar al gerente o (en teoría) a un
  // supervisor; resolvemos el gerente "tope" para juntar a todos los aprobadores.
  const { data: boss } = await client
    .from("profiles")
    .select("id, role, manager_id, status")
    .eq("id", directManagerId)
    .maybeSingle();
  if (!boss) return [];
  const topManagerId =
    boss.role === "supervisor" && boss.manager_id ? boss.manager_id : boss.id;

  const [{ data: managers }, { data: supervisors }] = await Promise.all([
    client
      .from("profiles")
      .select("id")
      .eq("id", topManagerId)
      .eq("role", "manager")
      .eq("status", "active"),
    client
      .from("profiles")
      .select("id")
      .eq("manager_id", topManagerId)
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

import type { AssignableUser } from "@/components/leads/reassign-dialog";
import { createClient } from "@/lib/supabase/server";

// Capacidad máxima de leads activos por vendedor. Hardcoded por ahora — más
// adelante puede pasar a una columna `max_concurrent_leads` en `profiles`.
export const VENDOR_MAX_CAPACITY = 20;

// Lista de vendedores asignables al alcance del rol que llama.
// Admin: todos los sales activos de la empresa.
// Manager: solo los sales bajo su manager_id.
// Incluye el conteo de leads activos (status ≠ 'closed') para calcular carga.
export async function getAssignableSalesUsers(opts: {
  companyId: string;
  managerId?: string | null;
}): Promise<AssignableUser[]> {
  const supabase = await createClient();

  // El tipo "Todos" es comodín: un vendedor que lo tiene cubre cualquier tipo.
  const { data: todos } = await supabase
    .from("product_types")
    .select("id")
    .eq("company_id", opts.companyId)
    .eq("name", "Todos")
    .maybeSingle();
  const todosId = todos?.id ?? null;

  let q = supabase
    .from("profiles")
    .select(
      `
        id,
        first_name,
        last_name,
        branch:branches!branch_id ( name ),
        user_product_types ( product_type_id )
      `,
    )
    .eq("company_id", opts.companyId)
    .eq("role", "sales")
    .eq("status", "active");

  if (opts.managerId) q = q.eq("manager_id", opts.managerId);

  const { data: users } = await q.order("first_name");
  const list = users ?? [];
  if (list.length === 0) return [];

  // Carga: leads asignados con status distinto a 'closed'.
  const userIds = list.map((u) => u.id);
  const { data: loadRows } = await supabase
    .from("leads")
    .select("assigned_user_id")
    .in("assigned_user_id", userIds)
    .neq("status", "closed");

  const loadByUser = new Map<string, number>();
  for (const row of loadRows ?? []) {
    if (!row.assigned_user_id) continue;
    loadByUser.set(
      row.assigned_user_id,
      (loadByUser.get(row.assigned_user_id) ?? 0) + 1,
    );
  }

  return list.map((u) => {
    const productTypeIds = (u.user_product_types ?? []).map(
      (upt) => upt.product_type_id,
    );
    return {
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      branchName: u.branch?.name ?? null,
      productTypeIds,
      // Cobertura "Todos": comodín para cualquier tipo de producto.
      coversAll: todosId ? productTypeIds.includes(todosId) : false,
      activeLeads: loadByUser.get(u.id) ?? 0,
      maxCapacity: VENDOR_MAX_CAPACITY,
    };
  });
}

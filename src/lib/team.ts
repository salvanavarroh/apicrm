import type { AssignableUser } from "@/components/leads/reassign-dialog";
import { createClient } from "@/lib/supabase/server";

// Lista de vendedores asignables al alcance del rol que llama.
// Admin: todos los sales activos de la empresa.
// Manager: solo los sales bajo su manager_id.
export async function getAssignableSalesUsers(opts: {
  companyId: string;
  managerId?: string | null;
}): Promise<AssignableUser[]> {
  const supabase = await createClient();

  let q = supabase
    .from("profiles")
    .select(
      `
        id,
        first_name,
        last_name,
        user_product_types ( product_type_id )
      `,
    )
    .eq("company_id", opts.companyId)
    .eq("role", "sales")
    .eq("status", "active");

  if (opts.managerId) q = q.eq("manager_id", opts.managerId);

  const { data } = await q.order("first_name");

  return (data ?? []).map((u) => ({
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    productTypeIds: (u.user_product_types ?? []).map(
      (upt) => upt.product_type_id,
    ),
  }));
}

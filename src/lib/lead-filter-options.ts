// Opciones para los filtros por columna de la tabla de leads (Sucursal, Tipo,
// Vendedor, Campaña). Scopeadas: admin = toda la empresa; gerente = sus
// gerencias y su equipo. Server-only.

import type { SupabaseClient } from "@supabase/supabase-js";

import { fullName } from "@/lib/leads";
import type { Database } from "@/types/database";

export type FilterOption = { id: string; label: string };

export type LeadFilterOptions = {
  branches: FilterOption[];
  productTypes: FilterOption[];
  vendors: FilterOption[];
  campaigns: FilterOption[];
};

export async function loadLeadFilterOptions(
  supabase: SupabaseClient<Database>,
  companyId: string,
  managerId?: string,
): Promise<LeadFilterOptions> {
  const campaignsP = supabase
    .from("campaigns")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name");

  if (managerId) {
    // Gerente/supervisor: sucursales + tipos de sus gerencias y su equipo.
    const [{ data: mgmts }, { data: vendors }, { data: campaigns }] =
      await Promise.all([
        supabase
          .from("managements")
          .select("branches(id, name), product_types(id, name)")
          .eq("manager_id", managerId),
        supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("company_id", companyId)
          .eq("role", "sales")
          .eq("manager_id", managerId)
          .order("first_name"),
        campaignsP,
      ]);
    const branchMap = new Map<string, string>();
    const ptMap = new Map<string, string>();
    for (const m of mgmts ?? []) {
      const b = m.branches as { id: string; name: string } | null;
      const p = m.product_types as { id: string; name: string } | null;
      if (b) branchMap.set(b.id, b.name);
      if (p) ptMap.set(p.id, p.name);
    }
    return {
      branches: Array.from(branchMap, ([id, label]) => ({ id, label })),
      productTypes: Array.from(ptMap, ([id, label]) => ({ id, label })),
      vendors: (vendors ?? []).map((v) => ({
        id: v.id,
        label: fullName(v.first_name, v.last_name),
      })),
      campaigns: (campaigns ?? []).map((c) => ({ id: c.id, label: c.name })),
    };
  }

  // Admin (o vendedor, que sólo usa sucursales/tipos): toda la empresa.
  const [{ data: branches }, { data: pts }, { data: vendors }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("product_types")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("role", "sales")
        .order("first_name"),
      campaignsP,
    ]);
  return {
    branches: (branches ?? []).map((b) => ({ id: b.id, label: b.name })),
    productTypes: (pts ?? []).map((p) => ({ id: p.id, label: p.name })),
    vendors: (vendors ?? []).map((v) => ({
      id: v.id,
      label: fullName(v.first_name, v.last_name),
    })),
    campaigns: (campaigns ?? []).map((c) => ({ id: c.id, label: c.name })),
  };
}

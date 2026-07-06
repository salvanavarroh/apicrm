"use server";

// ============================================================================
// Paginación server-side de la tabla de leads: filtros, búsqueda y paginado se
// resuelven en la DB (no se traen miles de filas al browser). Una sola action
// sirve a todos los roles: la RLS + el rol definen el alcance
// (admin/manager→empresa, sales→asignados, data_provider→creados).
// ============================================================================

import { requireRole } from "@/lib/auth";
import { fetchPaged } from "@/lib/leads-fetch";
import {
  fullName,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import type { LeadsTableRow } from "@/components/leads/leads-table";

// Debe coincidir con el PAGE_SIZE de LeadsTable (no se exporta: este archivo es
// "use server" y sólo puede exportar funciones async).
const LEADS_TABLE_PAGE = 50;

const ROLES = [
  "admin",
  "manager",
  "supervisor",
  "sales",
  "data_provider",
] as const;

const TABLE_SELECT = `
  id,
  first_name,
  last_name,
  phone,
  email,
  status,
  temperature,
  city,
  vehicle_model,
  vehicle_version,
  created_at,
  last_contacted_at,
  branches:branch_id (name),
  product_types:product_type_id (name),
  campaigns:campaign_id (name),
  assignee:profiles!assigned_user_id (first_name, last_name)
`;

export type LeadsTableScope = { archived?: boolean };

export type LeadsTableFilters = {
  q?: string;
  status?: LeadStatus | "all";
  temperature?: LeadTemperature | "all";
  createdFrom?: string;
  createdTo?: string;
  contactFrom?: string;
  contactTo?: string;
};

type TableRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  city: string | null;
  vehicle_model: string | null;
  vehicle_version: string | null;
  created_at: string;
  last_contacted_at: string | null;
  branches: { name: string } | null;
  product_types: { name: string } | null;
  campaigns: { name: string } | null;
  assignee: { first_name: string | null; last_name: string | null } | null;
};

function toRow(l: TableRow): LeadsTableRow {
  return {
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    temperature: l.temperature,
    city: l.city,
    vehicle_model: l.vehicle_model,
    vehicle_version: l.vehicle_version,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
    campaign_name: l.campaigns?.name ?? null,
    assignee_name: l.assignee
      ? fullName(l.assignee.first_name, l.assignee.last_name)
      : null,
    created_at: l.created_at,
    last_contacted_at: l.last_contacted_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function scopeQuery(
  query: Query,
  profile: { role: string; id: string; company_id: string | null },
  archived: boolean,
): Query {
  let q = query;
  if (profile.role === "sales") {
    q = q.eq("assigned_user_id", profile.id);
  } else if (profile.role === "data_provider") {
    q = q.eq("created_by", profile.id);
  } else {
    q = q.eq("company_id", profile.company_id);
  }
  return archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
}

function applyFilters(query: Query, f: LeadsTableFilters): Query {
  let q = query;
  const term = (f.q ?? "").replace(/[,()*]/g, " ").trim();
  if (term) {
    q = q.or(
      [
        `first_name.ilike.*${term}*`,
        `last_name.ilike.*${term}*`,
        `phone.ilike.*${term}*`,
        `email.ilike.*${term}*`,
        `city.ilike.*${term}*`,
        `vehicle_model.ilike.*${term}*`,
      ].join(","),
    );
  }
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.temperature && f.temperature !== "all")
    q = q.eq("temperature", f.temperature);
  if (f.createdFrom) q = q.gte("created_at", f.createdFrom);
  if (f.createdTo) q = q.lte("created_at", `${f.createdTo}T23:59:59`);
  if (f.contactFrom) q = q.gte("last_contacted_at", f.contactFrom);
  if (f.contactTo) q = q.lte("last_contacted_at", `${f.contactTo}T23:59:59`);
  return q;
}

export async function fetchLeadsTable(
  scope: LeadsTableScope,
  filters: LeadsTableFilters,
  page: number,
): Promise<{ rows: LeadsTableRow[]; total: number }> {
  const profile = await requireRole([...ROLES]);
  if (!profile.company_id && profile.role !== "sales") {
    return { rows: [], total: 0 };
  }
  const supabase = await createClient();
  const p = Math.max(1, page);

  let q = supabase.from("leads").select(TABLE_SELECT, { count: "exact" });
  q = scopeQuery(q, profile, Boolean(scope.archived));
  q = applyFilters(q, filters);
  q = q
    .order("created_at", { ascending: false })
    .range((p - 1) * LEADS_TABLE_PAGE, p * LEADS_TABLE_PAGE - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return {
    rows: ((data ?? []) as unknown as TableRow[]).map(toRow),
    total: count ?? 0,
  };
}

// Export: trae TODAS las filas que matchean (en tandas), hasta un tope de
// seguridad, para armar el CSV en el cliente.
export async function exportLeadsTable(
  scope: LeadsTableScope,
  filters: LeadsTableFilters,
): Promise<LeadsTableRow[]> {
  const profile = await requireRole([...ROLES]);
  if (!profile.company_id && profile.role !== "sales") return [];
  const supabase = await createClient();

  const { rows } = await fetchPaged<TableRow>(
    (withCount) => {
      let q = supabase
        .from("leads")
        .select(TABLE_SELECT, withCount ? { count: "exact" } : {});
      q = scopeQuery(q, profile, Boolean(scope.archived));
      q = applyFilters(q, filters).order("created_at", { ascending: false });
      return q;
    },
    10000,
  );
  return rows.map(toRow);
}

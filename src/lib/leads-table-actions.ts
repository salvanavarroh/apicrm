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
  status_changed_at,
  last_contacted_at,
  branches:branch_id (name),
  product_types:product_type_id (name),
  campaigns:campaign_id (name),
  assignee:profiles!assigned_user_id (first_name, last_name)
`;

// Estados "vivos" del pipeline pre-venta. Mismo set que usa el semáforo del
// dashboard de Admin, para que "sin gestión" signifique lo mismo en todas las
// pantallas.
const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

// Días sin cambio de estado a partir de los cuales un lead activo se considera
// "sin gestión" (rojo del semáforo).
const STALE_DAYS = 7;

export type LeadsTableScope = { archived?: boolean };

export type LeadsTableFilters = {
  q?: string;
  status?: LeadStatus | "all";
  temperature?: LeadTemperature | "all";
  createdFrom?: string;
  createdTo?: string;
  contactFrom?: string;
  contactTo?: string;
  branch_id?: string;
  product_type_id?: string;
  campaign_id?: string;
  assigned_user_id?: string; // uuid | "unassigned"
  form_id?: string; // metadata->>formId — leads de un formulario de Lead Ads
  /** Sólo leads activos sin cambio de estado hace +STALE_DAYS días. */
  staleOnly?: boolean;
};

export type LeadsSummary = {
  total: number;
  /** Suma de los estados vivos del pipeline (new + contacted + interested + quoted). */
  active: number;
  byStatus: Partial<Record<LeadStatus, number>>;
  unassigned: number;
  /** Leads activos sin cambio de estado en los últimos 7 días. */
  stale: number;
  /** Leads activos a los que nadie les puso temperatura. */
  noTemperature: number;
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
  status_changed_at: string;
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
    status_changed_at: l.status_changed_at,
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
  if (f.branch_id) q = q.eq("branch_id", f.branch_id);
  if (f.product_type_id) q = q.eq("product_type_id", f.product_type_id);
  if (f.campaign_id) q = q.eq("campaign_id", f.campaign_id);
  if (f.form_id) q = q.eq("metadata->>formId", f.form_id);
  if (f.assigned_user_id === "unassigned") {
    q = q.is("assigned_user_id", null);
  } else if (f.assigned_user_id) {
    q = q.eq("assigned_user_id", f.assigned_user_id);
  }
  if (f.createdFrom) q = q.gte("created_at", f.createdFrom);
  if (f.createdTo) q = q.lte("created_at", `${f.createdTo}T23:59:59`);
  if (f.contactFrom) q = q.gte("last_contacted_at", f.contactFrom);
  if (f.contactTo) q = q.lte("last_contacted_at", `${f.contactTo}T23:59:59`);
  if (f.staleOnly) {
    const cut = new Date(
      Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    q = q.in("status", ACTIVE_STATUSES).lt("status_changed_at", cut);
  }
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
  // No asignados primero, luego por fecha (para admin/gerente). En vendedor no
  // afecta (todo es suyo).
  q = q
    .order("assigned_user_id", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range((p - 1) * LEADS_TABLE_PAGE, p * LEADS_TABLE_PAGE - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return {
    rows: ((data ?? []) as unknown as TableRow[]).map(toRow),
    total: count ?? 0,
  };
}

/**
 * Contadores del encabezado de la sección de leads (chips por estado + alertas).
 *
 * Se calculan con `count: exact, head: true` — o sea en la DB, sin traer filas.
 * Respetan el scope por rol y TODOS los filtros activos EXCEPTO el de estado:
 * los chips tienen que mostrar cuántos leads hay en cada estado dentro del
 * recorte actual, no cuántos quedan del estado ya elegido.
 */
export async function fetchLeadsSummary(
  scope: LeadsTableScope,
  filters: LeadsTableFilters,
): Promise<LeadsSummary> {
  const profile = await requireRole([...ROLES]);
  const empty: LeadsSummary = {
    total: 0,
    active: 0,
    byStatus: {},
    unassigned: 0,
    stale: 0,
    noTemperature: 0,
  };
  if (!profile.company_id && profile.role !== "sales") return empty;

  const supabase = await createClient();
  const archived = Boolean(scope.archived);
  // El chip de estado no se filtra a sí mismo.
  const base = { ...filters, status: "all" as const };

  const count = (build: (q: Query) => Query) => {
    let q = supabase.from("leads").select("id", { count: "exact", head: true });
    q = scopeQuery(q, profile, archived);
    q = applyFilters(q, base);
    return build(q);
  };

  const staleCut = new Date(
    Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const statuses = [...ACTIVE_STATUSES, "not_interested" as LeadStatus];

  const [totalRes, unassignedRes, staleRes, noTempRes, ...statusRes] =
    await Promise.all([
      count((q) => q),
      count((q) => q.is("assigned_user_id", null)),
      count((q) =>
        q.in("status", ACTIVE_STATUSES).lt("status_changed_at", staleCut),
      ),
      count((q) => q.in("status", ACTIVE_STATUSES).is("temperature", null)),
      ...statuses.map((s) => count((q) => q.eq("status", s))),
    ]);

  const byStatus: Partial<Record<LeadStatus, number>> = {};
  statuses.forEach((s, i) => {
    byStatus[s] = statusRes[i]?.count ?? 0;
  });

  return {
    total: totalRes.count ?? 0,
    active: ACTIVE_STATUSES.reduce((a, s) => a + (byStatus[s] ?? 0), 0),
    byStatus,
    unassigned: unassignedRes.count ?? 0,
    stale: staleRes.count ?? 0,
    noTemperature: noTempRes.count ?? 0,
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

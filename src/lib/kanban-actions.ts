"use server";

// ============================================================================
// Carga acotada del tablero kanban. En vez de traer TODOS los leads (miles), el
// tablero pide top-N por columna y un conteo por estado; "cargar más" pagina por
// columna. Una sola action sirve para carga inicial y para cargar más, en todos
// los roles: la RLS scopea (manager→sus gerencias, sales→sus leads, admin→su
// empresa). Excluye archivados. Ver [[leads-page-1000-row-cap]].
// ============================================================================

import { requireRole } from "@/lib/auth";
import { fullName, type LeadStatus } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { KanbanLead } from "@/components/leads/kanban-board";

const KANBAN_PER_COLUMN = 50;

const KANBAN_SELECT = `
  id,
  first_name,
  last_name,
  phone,
  vehicle_model,
  vehicle_version,
  status,
  temperature,
  status_changed_at,
  assigned_user_id,
  branches:branch_id (name),
  product_types:product_type_id (name),
  assignee:profiles!assigned_user_id (first_name, last_name)
`;

const KANBAN_ROLES = ["admin", "manager", "supervisor", "sales"] as const;

type KanbanRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  vehicle_version: string | null;
  status: LeadStatus;
  temperature: KanbanLead["temperature"];
  status_changed_at: string | null;
  branches: { name: string } | null;
  product_types: { name: string } | null;
  assignee: { first_name: string | null; last_name: string | null } | null;
};

function toKanbanLead(l: KanbanRow): KanbanLead {
  return {
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    vehicle_model: l.vehicle_model,
    vehicle_version: l.vehicle_version,
    status: l.status,
    temperature: l.temperature,
    status_changed_at: l.status_changed_at,
    branch_name: l.branches?.name ?? null,
    product_type_name: l.product_types?.name ?? null,
    assignee_name: l.assignee
      ? fullName(l.assignee.first_name, l.assignee.last_name)
      : null,
    unread: 0,
  };
}

// Marca cuántos mensajes sin responder (unread) tiene cada lead en sus
// conversaciones. Admin client scopeado a los ids que RLS ya autorizó arriba
// (el usuario ya puede ver estos leads), así evitamos huecos de RLS en
// conversations sin exponer nada nuevo.
async function attachUnread(leads: KanbanLead[]): Promise<void> {
  const ids = leads.map((l) => l.id);
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("lead_id, unread_count")
    .in("lead_id", ids)
    .gt("unread_count", 0);
  if (!data) return;
  const byLead = new Map<string, number>();
  for (const c of data) {
    if (!c.lead_id) continue;
    byLead.set(c.lead_id, (byLead.get(c.lead_id) ?? 0) + (c.unread_count ?? 0));
  }
  for (const l of leads) l.unread = byLead.get(l.id) ?? 0;
}

/**
 * Trae una página de `per` leads de una columna (estado). `offset` para paginar
 * con "cargar más". Scopeado por RLS + rol (sales ve sólo lo suyo).
 */
export async function fetchKanbanColumn(
  status: LeadStatus,
  offset: number,
  per: number = KANBAN_PER_COLUMN,
): Promise<KanbanLead[]> {
  const profile = await requireRole([...KANBAN_ROLES]);
  if (!profile.company_id) return [];
  const supabase = await createClient();

  let q = supabase
    .from("leads")
    .select(KANBAN_SELECT)
    .eq("status", status)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + per - 1);

  if (profile.role === "sales") {
    q = q.eq("assigned_user_id", profile.id);
  } else {
    // manager/supervisor: la RLS ya restringe a sus gerencias; admin: su empresa.
    q = q.eq("company_id", profile.company_id);
  }

  const { data } = await q;
  const leads = ((data ?? []) as unknown as KanbanRow[]).map(toKanbanLead);
  await attachUnread(leads);
  return leads;
}

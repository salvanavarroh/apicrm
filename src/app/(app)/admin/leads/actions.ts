"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  CSV_HEADERS,
  leadInputSchema,
  normalizeEmail,
  normalizePhone,
  type CsvRow,
  type LeadInput,
  type LeadRow,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

// ----------------------------------------------------------------------------
// Helpers de revalidación: refrescamos las rutas relevantes según rol.
// ----------------------------------------------------------------------------

function revalidateLeadsPaths() {
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/pool");
  revalidatePath("/manager/leads");
  revalidatePath("/data-provider/leads");
  revalidatePath("/data-provider/pool");
  revalidatePath("/sales/leads");
}

// ----------------------------------------------------------------------------
// Buscar duplicado por phone/email dentro de la empresa.
// ----------------------------------------------------------------------------

export type DuplicateInfo = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadRow["status"];
  created_at: string;
};

export async function findDuplicateLead(
  phone: string | null,
  email: string | null,
): Promise<DuplicateInfo | null> {
  const profile = await requireRole(["admin", "manager", "data_provider"]);
  if (!profile.company_id) return null;

  const supabase = await createClient();
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = normalizeEmail(email);
  if (!cleanPhone && !cleanEmail) return null;

  const filters: string[] = [];
  if (cleanPhone) filters.push(`phone.eq.${cleanPhone}`);
  if (cleanEmail) filters.push(`email.eq.${cleanEmail}`);

  const { data } = await supabase
    .from("leads")
    .select("id, first_name, last_name, phone, email, status, created_at")
    .eq("company_id", profile.company_id)
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

// ----------------------------------------------------------------------------
// Crear lead (manual). Admin / Manager / Provider.
// Si hay duplicado y `mode = "register_submission"`, solo registra submission.
// Si hay duplicado y `mode = "skip_check"`, crea de cualquier forma.
// Default: si hay duplicado retorna info para que el front pregunte.
// ----------------------------------------------------------------------------

type CreateLeadMode = "auto" | "skip_check" | "register_submission";

const createLeadSchema = leadInputSchema;

export async function createLead(
  input: LeadInput,
  options: { mode?: CreateLeadMode } = {},
): Promise<
  Result<{ leadId?: string; submissionId?: string }> & {
    duplicate?: DuplicateInfo;
  }
> {
  const profile = await requireRole(["admin", "manager", "data_provider"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const mode = options.mode ?? "auto";
  const phone = normalizePhone(parsed.data.phone || null);
  const email = normalizeEmail(parsed.data.email || null);

  const supabase = await createClient();

  // Chequeo de duplicado (salvo skip_check)
  const duplicate =
    mode === "skip_check" ? null : await findDuplicateLead(phone, email);

  if (mode === "register_submission") {
    if (!duplicate) {
      return { ok: false, message: "No hay lead duplicado para registrar" };
    }
    const { data: submission, error } = await supabase
      .from("lead_submissions")
      .insert({
        lead_id: duplicate.id,
        company_id: profile.company_id,
        submitted_by: profile.id,
        campaign_id: parsed.data.campaign_id || null,
        data_snapshot: sanitizedSnapshot(parsed.data),
      })
      .select("id")
      .single();

    if (error || !submission) {
      return { ok: false, message: error?.message ?? "Error inesperado" };
    }
    revalidateLeadsPaths();
    return { ok: true, submissionId: submission.id };
  }

  if (mode === "auto" && duplicate) {
    return { ok: false, message: "Lead duplicado", duplicate };
  }

  // Insertar lead nuevo
  const insert: LeadInsert = {
    company_id: profile.company_id,
    first_name: parsed.data.first_name || null,
    last_name: parsed.data.last_name || null,
    email,
    phone,
    city: parsed.data.city || null,
    vehicle_model: parsed.data.vehicle_model || null,
    vehicle_version: parsed.data.vehicle_version || null,
    preferred_color: parsed.data.preferred_color || null,
    budget_min:
      parsed.data.budget_min === "" || parsed.data.budget_min === undefined
        ? null
        : Number(parsed.data.budget_min),
    budget_max:
      parsed.data.budget_max === "" || parsed.data.budget_max === undefined
        ? null
        : Number(parsed.data.budget_max),
    has_used_car: parsed.data.has_used_car ?? false,
    used_car_description: parsed.data.used_car_description || null,
    declared_payment_method: parsed.data.declared_payment_method || null,
    campaign_id: parsed.data.campaign_id || null,
    branch_id: parsed.data.branch_id || null,
    product_type_id: parsed.data.product_type_id || null,
    initial_notes: parsed.data.initial_notes || null,
    created_by: profile.id,
  };

  const { data: lead, error } = await supabase
    .from("leads")
    .insert(insert)
    .select("id")
    .single();

  if (error || !lead) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  // Registrar submission inicial (snapshot de la carga original).
  await supabase.from("lead_submissions").insert({
    lead_id: lead.id,
    company_id: profile.company_id,
    submitted_by: profile.id,
    campaign_id: parsed.data.campaign_id || null,
    data_snapshot: sanitizedSnapshot(parsed.data),
  });

  // Intento de auto-asignación (no falla si no hay candidatos).
  if (insert.branch_id && insert.product_type_id) {
    await supabase.rpc("auto_assign_lead", { p_lead_id: lead.id });
  }

  revalidateLeadsPaths();
  return { ok: true, leadId: lead.id };
}

function sanitizedSnapshot(data: Record<string, unknown>) {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === "" || value === undefined || value === null) continue;
    snapshot[key] = value;
  }
  return snapshot as Database["public"]["Tables"]["lead_submissions"]["Insert"]["data_snapshot"];
}

// ----------------------------------------------------------------------------
// Update lead. La RLS filtra por rol (Provider solo sus 'new', Sales sus leads).
// ----------------------------------------------------------------------------

export async function updateLead(
  id: string,
  input: LeadInput,
): Promise<Result<{ id: string }>> {
  const profile = await requireRole([
    "admin",
    "manager",
    "sales",
    "data_provider",
  ]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = leadInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const update: LeadUpdate = {
    first_name: parsed.data.first_name || null,
    last_name: parsed.data.last_name || null,
    email: normalizeEmail(parsed.data.email || null),
    phone: normalizePhone(parsed.data.phone || null),
    city: parsed.data.city || null,
    vehicle_model: parsed.data.vehicle_model || null,
    vehicle_version: parsed.data.vehicle_version || null,
    preferred_color: parsed.data.preferred_color || null,
    budget_min:
      parsed.data.budget_min === "" || parsed.data.budget_min === undefined
        ? null
        : Number(parsed.data.budget_min),
    budget_max:
      parsed.data.budget_max === "" || parsed.data.budget_max === undefined
        ? null
        : Number(parsed.data.budget_max),
    has_used_car: parsed.data.has_used_car ?? false,
    used_car_description: parsed.data.used_car_description || null,
    declared_payment_method: parsed.data.declared_payment_method || null,
    campaign_id: parsed.data.campaign_id || null,
    branch_id: parsed.data.branch_id || null,
    product_type_id: parsed.data.product_type_id || null,
    initial_notes: parsed.data.initial_notes || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(update).eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidateLeadsPaths();
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath(`/manager/leads/${id}`);
  revalidatePath(`/data-provider/leads/${id}`);
  return { ok: true, id };
}

// ----------------------------------------------------------------------------
// Clasificar pool: setear branch + product_type. Admin o Provider (su carga).
// ----------------------------------------------------------------------------

const classifySchema = z.object({
  branch_id: z.string().uuid(),
  product_type_id: z.string().uuid(),
});

export async function classifyLead(
  id: string,
  branchId: string,
  productTypeId: string,
): Promise<Result<{ id: string }>> {
  const profile = await requireRole(["admin", "data_provider"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = classifySchema.safeParse({
    branch_id: branchId,
    product_type_id: productTypeId,
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      branch_id: parsed.data.branch_id,
      product_type_id: parsed.data.product_type_id,
    })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  // Auto-asignar después de clasificar.
  await supabase.rpc("auto_assign_lead", { p_lead_id: id });

  revalidateLeadsPaths();
  return { ok: true, id };
}

// ----------------------------------------------------------------------------
// Bulk insert desde CSV. Admin o Provider. Inserta lo que viene en `rows`
// (ya validado y editado en el front). Defaults aplicables (branch/pt/campaña).
// Devuelve cuántas filas insertó y cuáles fallaron.
// ----------------------------------------------------------------------------

export type BulkInsertResult = {
  ok: true;
  inserted: number;
  failed: number;
  errors: { row: number; message: string }[];
};

export async function bulkInsertLeads(
  rows: CsvRow[],
  defaults: {
    branch_id?: string;
    product_type_id?: string;
    campaign_id?: string;
  } = {},
): Promise<BulkInsertResult | { ok: false; message: string }> {
  const profile = await requireRole(["admin", "data_provider"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, message: "No hay filas para importar" };
  }

  const supabase = await createClient();
  const inserts: LeadInsert[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    const phone = normalizePhone(row.phone || null);
    const email = normalizeEmail(row.email || null);
    if (!phone && !email) {
      errors.push({ row: index + 1, message: "Falta teléfono o email" });
      return;
    }

    const payment = row.declared_payment_method;
    const validPayment =
      payment && CSV_HEADERS.includes(payment as never)
        ? null
        : (payment as Database["public"]["Enums"]["lead_payment_method"]) ||
          null;

    inserts.push({
      company_id: profile.company_id!,
      first_name: row.first_name || null,
      last_name: row.last_name || null,
      email,
      phone,
      city: row.city || null,
      vehicle_model: row.vehicle_model || null,
      vehicle_version: row.vehicle_version || null,
      preferred_color: row.preferred_color || null,
      budget_min: row.budget_min ? Number(row.budget_min) : null,
      budget_max: row.budget_max ? Number(row.budget_max) : null,
      has_used_car:
        row.has_used_car === "true" ||
        row.has_used_car === "1" ||
        row.has_used_car === "sí" ||
        row.has_used_car === "si",
      used_car_description: row.used_car_description || null,
      declared_payment_method: isValidPaymentMethod(payment) ? payment : null,
      initial_notes: row.initial_notes || null,
      branch_id: defaults.branch_id || null,
      product_type_id: defaults.product_type_id || null,
      campaign_id: defaults.campaign_id || null,
      created_by: profile.id,
    });
    void validPayment;
  });

  if (inserts.length === 0) {
    return { ok: true, inserted: 0, failed: errors.length, errors };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert(inserts)
    .select("id");

  if (error) {
    return { ok: false, message: error.message };
  }

  // Submissions iniciales en bulk.
  if (data && data.length > 0) {
    const submissions = data.map((lead, idx) => ({
      lead_id: lead.id,
      company_id: profile.company_id!,
      submitted_by: profile.id,
      campaign_id: defaults.campaign_id || null,
      data_snapshot: rows[idx] as Database["public"]["Tables"]["lead_submissions"]["Insert"]["data_snapshot"],
    }));
    await supabase.from("lead_submissions").insert(submissions);
  }

  revalidateLeadsPaths();
  return {
    ok: true,
    inserted: data?.length ?? 0,
    failed: errors.length,
    errors,
  };
}

function isValidPaymentMethod(
  value: unknown,
): value is Database["public"]["Enums"]["lead_payment_method"] {
  return (
    value === "cash" ||
    value === "financed" ||
    value === "savings_plan" ||
    value === "used_car" ||
    value === "other"
  );
}

// ----------------------------------------------------------------------------
// Delete lead (Admin).
// ----------------------------------------------------------------------------

export async function deleteLead(id: string): Promise<Result<{ id: string }>> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidateLeadsPaths();
  return { ok: true, id };
}

// ----------------------------------------------------------------------------
// Reasignar lead (Admin o Manager dentro de su gerencia).
// El nuevo vendedor debe pertenecer a la misma empresa.
// ----------------------------------------------------------------------------

export async function reassignLead(
  leadId: string,
  newAssigneeId: string | null,
): Promise<Result<{ leadId: string }>> {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      assigned_user_id: newAssigneeId,
      assigned_at: newAssigneeId ? new Date().toISOString() : null,
    })
    .eq("id", leadId);

  if (error) return { ok: false, message: error.message };

  revalidateLeadsPaths();
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/manager/leads/${leadId}`);
  return { ok: true, leadId };
}

// ----------------------------------------------------------------------------
// Cambio de estado del lead (Sales en su pipeline).
// ----------------------------------------------------------------------------

const STATUS_VALUES = [
  "new",
  "contacted",
  "interested",
  "quoted",
  "evaluating",
  "accepted",
  "rejected",
  "closed",
  "not_interested",
] as const;

export async function updateLeadStatus(
  leadId: string,
  newStatus: (typeof STATUS_VALUES)[number],
): Promise<Result<{ leadId: string }>> {
  const profile = await requireRole(["sales", "admin", "manager"]);
  if (!STATUS_VALUES.includes(newStatus)) {
    return { ok: false, message: "Estado inválido" };
  }
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status: newStatus })
    .eq("id", leadId);
  if (error) return { ok: false, message: error.message };

  revalidateLeadsPaths();
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/manager/leads/${leadId}`);
  revalidatePath(`/sales/leads/${leadId}`);
  return { ok: true, leadId };
}

// ----------------------------------------------------------------------------
// Notas del lead.
// ----------------------------------------------------------------------------

export async function addLeadNote(
  leadId: string,
  content: string,
): Promise<Result<{ noteId: string }>> {
  const profile = await requireRole([
    "admin",
    "manager",
    "sales",
  ]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "La nota no puede estar vacía" };
  }
  if (trimmed.length > 5000) {
    return { ok: false, message: "Nota demasiado larga" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .insert({
      lead_id: leadId,
      company_id: profile.company_id,
      author_id: profile.id,
      content: trimmed,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/manager/leads/${leadId}`);
  revalidatePath(`/sales/leads/${leadId}`);
  return { ok: true, noteId: data.id };
}

// ----------------------------------------------------------------------------
// Tareas del lead.
// ----------------------------------------------------------------------------

const taskInputSchema = z.object({
  title: z.string().min(1, "Título obligatorio"),
  description: z.string().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: z.string().optional().or(z.literal("")),
});

export type TaskInput = z.input<typeof taskInputSchema>;

export async function addLeadTask(
  leadId: string,
  raw: TaskInput,
): Promise<Result<{ taskId: string }>> {
  const profile = await requireRole(["admin", "manager", "sales"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_tasks")
    .insert({
      lead_id: leadId,
      company_id: profile.company_id,
      created_by: profile.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description || null,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Error inesperado" };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/manager/leads/${leadId}`);
  revalidatePath(`/sales/leads/${leadId}`);
  return { ok: true, taskId: data.id };
}

export async function toggleLeadTask(
  taskId: string,
  done: boolean,
): Promise<Result<{ taskId: string }>> {
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_tasks")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, taskId };
}

export async function deleteLeadTask(
  taskId: string,
): Promise<Result<{ taskId: string }>> {
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();
  const { error } = await supabase.from("lead_tasks").delete().eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, taskId };
}

// ----------------------------------------------------------------------------
// Toggle auto-assignment en una gerencia (Manager o Admin).
// ----------------------------------------------------------------------------

export async function setAutoAssignment(
  managementId: string,
  enabled: boolean,
): Promise<Result<{ id: string }>> {
  await requireRole(["admin", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("managements")
    .update({ auto_assignment_enabled: enabled })
    .eq("id", managementId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/manager/managements");
  revalidatePath("/admin");
  return { ok: true, id: managementId };
}

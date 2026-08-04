"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { toE164 } from "@/lib/phone";
import { listFormLeads, listLeadForms } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type Result = { ok: true } | { ok: false; message: string };

export type PulledForm = { id: string; name: string };

// El accountId de la Página de Facebook que administra los Lead Ads. OJO: esa
// cuenta puede figurar "desconectada" (es la página arrastrada por Meta Ads,
// enabled:false), pero igual es la dueña de los formularios → no filtramos por
// status. Ignoramos las cuentas mock del demo.
async function facebookAccountId(
  admin: Admin,
  companyId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("messaging_channels")
    .select("zernio_account_id, status")
    .eq("company_id", companyId)
    .eq("platform", "facebook")
    .not("zernio_account_id", "like", "mock%")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const active = rows.find((r) => r.status === "active");
  return (active ?? rows[0])?.zernio_account_id ?? null;
}

/** Trae los formularios de Lead Ads ya cargados en la Página de Facebook conectada. */
export async function pullLeadForms(): Promise<
  { ok: true; forms: PulledForm[] } | { ok: false; message: string }
> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const accountId = await facebookAccountId(admin, profile.company_id!);
  if (!accountId) {
    return {
      ok: false,
      message: "Conectá primero una Página de Facebook (Meta Ads → Conexión).",
    };
  }
  try {
    const res = await listLeadForms(accountId);
    const list = res.forms ?? res.data ?? [];
    return { ok: true, forms: list.map((f) => ({ id: f.id, name: f.name ?? f.id })) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error trayendo formularios" };
  }
}

/** Crea/actualiza el mapeo de un formulario de Meta Lead Ads → routing. */
export async function upsertLeadAdForm(input: {
  metaFormId: string;
  formName?: string;
  branchId?: string;
  productTypeId?: string;
  campaignId?: string;
}): Promise<Result> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const metaFormId = input.metaFormId.trim();
  if (!metaFormId) return { ok: false, message: "Falta el ID del formulario de Meta" };

  const { error } = await admin.from("lead_ad_forms").upsert(
    {
      company_id: profile.company_id!,
      meta_form_id: metaFormId,
      form_name: input.formName?.trim() || null,
      branch_id: input.branchId || null,
      product_type_id: input.productTypeId || null,
      campaign_id: input.campaignId || null,
    },
    { onConflict: "company_id,meta_form_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/lead-ads");
  return { ok: true };
}

/** Crea una campaña a partir de un formulario (origen meta_ads). Devuelve su id
 *  para asignarla en el mismo mapeo, sin tener que cargarla aparte. */
export async function createCampaignFromForm(input: {
  name: string;
  branchId?: string;
  productTypeId?: string;
}): Promise<
  { ok: true; campaignId: string; name: string } | { ok: false; message: string }
> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Falta el nombre de la campaña" };
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      company_id: profile.company_id!,
      name,
      origin: "meta_ads",
      branch_id: input.branchId || null,
      product_type_id: input.productTypeId || null,
    })
    .select("id, name")
    .single();
  if (error || !data)
    return { ok: false, message: error?.message ?? "Error creando campaña" };
  revalidatePath("/admin/integraciones");
  return { ok: true, campaignId: data.id, name: data.name };
}

export async function deleteLeadAdForm(id: string): Promise<Result> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("lead_ad_forms")
    .delete()
    .eq("id", id)
    .eq("company_id", profile.company_id!);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/lead-ads");
  return { ok: true };
}

const IMPORT_TIME_BUDGET_MS = 45_000;
const IMPORT_PAGE = 100;

// Toma el primer valor no vacío entre varias claves, respetando el field_map del
// formulario (clave real de Meta → clave canónica del CRM).
function fieldGetter(fields: Record<string, unknown>, fieldMap: Record<string, string>) {
  return (keys: string[]): string | null => {
    for (const k of keys) {
      const v = fields[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      const src = Object.entries(fieldMap).find(([, dest]) => dest === k)?.[0];
      if (src) {
        const mv = fields[src];
        if (typeof mv === "string" && mv.trim()) return mv.trim();
      }
    }
    return null;
  };
}

/**
 * Import histórico (reanudable) de los leads de un formulario de Meta Lead Ads.
 * Resuelve el contexto (routing del canal + mapeo del form + país + dedup) UNA
 * sola vez y luego inserta por tandas en bloque (sin re-consultar por lead), así
 * entran miles por tanda. Corre server-side acotado en tiempo: si quedan más,
 * deja el job en "paused" con el cursor y el front ofrece "Continuar". Al
 * terminar avisa por notificación. Idempotente (dedup por leadgenId).
 *
 * Los leads importados quedan clasificados por sucursal/tipo/campaña del mapeo
 * pero SIN asignar a un vendedor (van al pool): es historial, no conviene
 * inundar a los vendedores con miles de leads viejos por round-robin. Los leads
 * nuevos (webhook en vivo) sí se auto-asignan.
 */
export async function startFormImport(metaFormId: string): Promise<
  | { ok: true; status: "done" | "paused"; imported: number; duplicates: number }
  | { ok: false; message: string }
> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const companyId = profile.company_id!;
  const accountId = await facebookAccountId(admin, companyId);
  if (!accountId) {
    return { ok: false, message: "Conectá primero una Página de Facebook (Meta Ads → Conexión)." };
  }

  // Contexto una sola vez: routing por defecto del canal, mapeo del formulario,
  // país de la empresa (para E.164) y los leadgenId ya importados (dedup).
  const [{ data: chan }, { data: mapping }, { data: co }, { data: existingLeads }] =
    await Promise.all([
      admin
        .from("messaging_channels")
        .select("branch_id, product_type_id, campaign_id")
        .eq("company_id", companyId)
        .eq("platform", "facebook")
        .not("zernio_account_id", "like", "mock%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("lead_ad_forms")
        .select("branch_id, product_type_id, campaign_id, field_map")
        .eq("company_id", companyId)
        .eq("meta_form_id", metaFormId)
        .maybeSingle(),
      admin.from("companies").select("country").eq("id", companyId).maybeSingle(),
      admin
        .from("leads")
        .select("external_id")
        .eq("company_id", companyId)
        .eq("metadata->>formId", metaFormId),
    ]);

  const branchId = mapping?.branch_id ?? chan?.branch_id ?? null;
  const productTypeId = mapping?.product_type_id ?? chan?.product_type_id ?? null;
  const campaignId = mapping?.campaign_id ?? chan?.campaign_id ?? null;
  const fieldMap = (mapping?.field_map as Record<string, string> | null) ?? {};
  const country = co?.country ?? null;
  const seen = new Set<string>();
  for (const r of existingLeads ?? []) if (r.external_id) seen.add(r.external_id);

  // Reanudar el job existente (salvo que estuviera "done" → re-importa de cero).
  const { data: existing } = await admin
    .from("lead_ad_imports")
    .select("id, cursor, imported, duplicates, status")
    .eq("company_id", companyId)
    .eq("meta_form_id", metaFormId)
    .maybeSingle();
  const resume = !!existing && existing.status !== "done";
  let cursor: string | undefined = resume ? existing!.cursor ?? undefined : undefined;
  let imported = resume ? existing!.imported : 0;
  let duplicates = resume ? existing!.duplicates : 0;

  const { data: job } = await admin
    .from("lead_ad_imports")
    .upsert(
      {
        company_id: companyId,
        meta_form_id: metaFormId,
        status: "running",
        cursor: cursor ?? null,
        imported,
        duplicates,
        error: null,
      },
      { onConflict: "company_id,meta_form_id" },
    )
    .select("id")
    .single();
  const jobId = job?.id;
  if (!jobId) return { ok: false, message: "No se pudo crear el job de import" };

  const started = Date.now();
  try {
    for (;;) {
      const page = await listFormLeads({ formId: metaFormId, accountId, cursor, limit: IMPORT_PAGE });
      const rows: Record<string, unknown>[] = [];
      for (const z of page.leads) {
        if (!z.id || seen.has(z.id)) {
          if (z.id) duplicates++;
          continue;
        }
        seen.add(z.id);
        const fields = (z.fields ?? {}) as Record<string, unknown>;
        const get = fieldGetter(fields, fieldMap);
        const fullName = get(["full_name", "name", "nombre", "first_name"]) ?? "";
        const parts = fullName.split(/\s+/).filter(Boolean);
        const rawPhone = get(["phone", "phone_number", "telefono", "teléfono"]);
        rows.push({
          company_id: companyId,
          first_name: parts[0] ?? null,
          last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
          email: get(["email", "correo", "e-mail"]),
          phone: rawPhone,
          phone_e164: rawPhone ? toE164(rawPhone, country) : null,
          city: get(["city", "ciudad"]),
          vehicle_model: get(["vehicle", "vehicle_model", "modelo", "vehículo"]),
          source: "Meta Lead Ads",
          external_id: z.id,
          source_created_at: z.createdTime ?? null,
          metadata: { adId: z.adId ?? null, formId: metaFormId },
          branch_id: branchId,
          product_type_id: productTypeId,
          campaign_id: campaignId,
          status: "new",
        });
      }
      if (rows.length) {
        const { error } = await admin.from("leads").insert(rows as never);
        if (error) throw new Error(error.message);
        imported += rows.length;
      }
      cursor = page.cursor;
      await admin
        .from("lead_ad_imports")
        .update({ imported, duplicates, cursor: cursor ?? null })
        .eq("id", jobId);

      if (!page.hasMore) {
        await admin.from("lead_ad_imports").update({ status: "done" }).eq("id", jobId);
        revalidatePath("/admin/leads");
        await notify(
          [
            {
              companyId,
              userId: profile.id,
              category: "leads",
              type: "lead_ad_received",
              title: "Importación de Lead Ads terminada",
              body: `${imported} leads nuevos${duplicates ? ` · ${duplicates} ya existían` : ""}`,
              link: `/admin/leads?form=${metaFormId}`,
            },
          ],
          admin,
        );
        return { ok: true, status: "done", imported, duplicates };
      }
      if (Date.now() - started > IMPORT_TIME_BUDGET_MS) {
        await admin.from("lead_ad_imports").update({ status: "paused" }).eq("id", jobId);
        return { ok: true, status: "paused", imported, duplicates };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error importando";
    await admin.from("lead_ad_imports").update({ status: "error", error: msg }).eq("id", jobId);
    return { ok: false, message: msg };
  }
}

export type FormLeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
};
export type FormImportJob = {
  status: string;
  imported: number;
  duplicates: number;
  error: string | null;
  updated_at: string;
} | null;

/** Estado del job de import de varios formularios (para las filas mapeadas). */
export async function getFormStatuses(
  metaFormIds: string[],
): Promise<Record<string, FormImportJob>> {
  if (metaFormIds.length === 0) return {};
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("lead_ad_imports")
    .select("meta_form_id, status, imported, duplicates, error, updated_at")
    .eq("company_id", profile.company_id!)
    .in("meta_form_id", metaFormIds);
  const map: Record<string, FormImportJob> = {};
  for (const r of data ?? []) {
    map[r.meta_form_id] = {
      status: r.status,
      imported: r.imported,
      duplicates: r.duplicates,
      error: r.error,
      updated_at: r.updated_at,
    };
  }
  return map;
}

/** Leads ya ingresados de un formulario (por webhook o import) + estado del job. */
export async function getFormLeads(metaFormId: string): Promise<
  | { ok: true; leads: FormLeadRow[]; total: number; job: FormImportJob }
  | { ok: false; message: string }
> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const [{ data: leads, count }, { data: job }] = await Promise.all([
    admin
      .from("leads")
      .select("id, first_name, last_name, phone, email, status, created_at", { count: "exact" })
      .eq("company_id", profile.company_id!)
      .eq("metadata->>formId", metaFormId)
      .is("merged_into_id", null)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("lead_ad_imports")
      .select("status, imported, duplicates, error, updated_at")
      .eq("company_id", profile.company_id!)
      .eq("meta_form_id", metaFormId)
      .maybeSingle(),
  ]);
  return {
    ok: true,
    leads: (leads ?? []) as FormLeadRow[],
    total: count ?? 0,
    job: (job ?? null) as FormImportJob,
  };
}

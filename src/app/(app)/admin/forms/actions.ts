"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  DEFAULT_FIELDS,
  formInputSchema,
  generateSlug,
  parseFields,
  type FormInput,
} from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

function revalidateForms() {
  revalidatePath("/admin/forms");
  revalidatePath("/manager/forms");
}

async function ensureManagerScope(
  branchId: string,
  productTypeId: string,
  managerId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("managements")
    .select("id")
    .eq("manager_id", managerId)
    .eq("branch_id", branchId)
    .eq("product_type_id", productTypeId)
    .maybeSingle();
  return !!data;
}

export async function createForm(
  raw: FormInput,
): Promise<Result<{ id: string; slug: string }>> {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const parsed = formInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const data = parsed.data;

  if (profile.role === "manager") {
    const ok = await ensureManagerScope(
      data.branch_id,
      data.product_type_id,
      profile.id,
    );
    if (!ok) {
      return {
        ok: false,
        message: "Esa sucursal + tipo no está dentro de tus gerencias",
      };
    }
  }

  const supabase = await createClient();

  let slug = generateSlug();
  // Guard contra colisión (probabilidad mínima pero por las dudas).
  for (let i = 0; i < 5; i++) {
    const { data: exists } = await supabase
      .from("lead_capture_forms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!exists) break;
    slug = generateSlug();
  }

  const { data: row, error } = await supabase
    .from("lead_capture_forms")
    .insert({
      slug,
      company_id: profile.company_id,
      branch_id: data.branch_id,
      product_type_id: data.product_type_id,
      campaign_id: data.campaign_id || null,
      created_by: profile.id,
      name: data.name.trim(),
      status: data.status,
      title: data.title.trim(),
      subtitle: data.subtitle || null,
      submit_label: data.submit_label,
      success_message: data.success_message,
      logo_url: data.logo_url || null,
      banner_url: data.banner_url || null,
      primary_color: data.primary_color,
      fields: data.fields,
    })
    .select("id, slug")
    .single();

  if (error || !row) {
    return { ok: false, message: error?.message ?? "Error creando" };
  }

  revalidateForms();
  return { ok: true, id: row.id, slug: row.slug };
}

export async function updateForm(
  id: string,
  raw: FormInput,
): Promise<Result<{ id: string }>> {
  const profile = await requireRole(["admin", "manager"]);
  const parsed = formInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const data = parsed.data;

  if (profile.role === "manager") {
    const ok = await ensureManagerScope(
      data.branch_id,
      data.product_type_id,
      profile.id,
    );
    if (!ok) {
      return {
        ok: false,
        message: "Esa sucursal + tipo no está dentro de tus gerencias",
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_capture_forms")
    .update({
      branch_id: data.branch_id,
      product_type_id: data.product_type_id,
      campaign_id: data.campaign_id || null,
      name: data.name.trim(),
      status: data.status,
      title: data.title.trim(),
      subtitle: data.subtitle || null,
      submit_label: data.submit_label,
      success_message: data.success_message,
      logo_url: data.logo_url || null,
      banner_url: data.banner_url || null,
      primary_color: data.primary_color,
      fields: data.fields,
    })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  revalidateForms();
  revalidatePath(`/admin/forms/${id}`);
  revalidatePath(`/manager/forms/${id}`);
  return { ok: true, id };
}

export async function deleteForm(id: string): Promise<Result<{ id: string }>> {
  await requireRole(["admin", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_capture_forms")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidateForms();
  return { ok: true, id };
}

export async function toggleFormStatus(
  id: string,
  next: "active" | "inactive",
): Promise<Result<{ id: string }>> {
  await requireRole(["admin", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_capture_forms")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidateForms();
  return { ok: true, id };
}

// ============================================================================
// Upload logo / banner al bucket form-assets/{company_id}/...
// File entra como base64 dataURL desde el client (pequeño).
// Devuelve la URL pública.
// ============================================================================

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadFormAsset(
  kind: "logo" | "banner",
  dataUrl: string,
): Promise<Result<{ url: string }>> {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { ok: false, message: "Formato de imagen inválido" };
  }
  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, message: "La imagen supera los 2 MB" };
  }
  const ext =
    mime === "image/png" ? "png" :
    mime === "image/jpeg" ? "jpg" :
    mime === "image/webp" ? "webp" :
    mime === "image/svg+xml" ? "svg" : null;
  if (!ext) {
    return { ok: false, message: "Tipo de imagen no soportado (PNG/JPG/WEBP/SVG)" };
  }

  const admin = createAdminClient();
  const filename = `${profile.company_id}/${kind}-${profile.id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("form-assets")
    .upload(filename, buffer, {
      contentType: mime,
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, message: uploadErr.message };
  }

  const { data: pub } = admin.storage.from("form-assets").getPublicUrl(filename);
  return { ok: true, url: pub.publicUrl };
}

// Re-export helpers para el form UI.
export { DEFAULT_FIELDS, parseFields };

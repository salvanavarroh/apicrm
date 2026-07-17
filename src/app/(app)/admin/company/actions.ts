"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  logo_url: z
    .string()
    .url("URL inválida")
    .optional()
    .or(z.literal("")),
  quote_legal_text: z.string().max(2000).optional().or(z.literal("")),
  quote_hide_name: z.boolean().optional(),
});

export type UpdateCompanyState = {
  fieldErrors?: Record<string, string>;
  formError?: string;
  success?: boolean;
};

/**
 * Server action invocada directamente desde el modal de edición.
 * (Mantengo también la versión con useActionState para casos sin modal.)
 */
export async function saveCompanyOperational(
  input: z.input<typeof schema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      logo_url: parsed.data.logo_url || null,
      quote_legal_text: parsed.data.quote_legal_text || null,
      quote_hide_name: parsed.data.quote_hide_name ?? false,
    })
    .eq("id", profile.company_id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/company");
  return { ok: true };
}

// Sube el logo de la empresa (dataURL base64) a un bucket público y devuelve la
// URL. Se usa desde el modal de edición para setear logo_url.
const LOGO_RE = /^data:(image\/(png|jpe?g|webp|svg\+xml));base64,/;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function uploadCompanyLogo(
  dataUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };
  const m = dataUrl.match(LOGO_RE);
  if (!m) return { ok: false, message: "Formato no soportado (usá PNG/JPG/WEBP/SVG)" };
  const mime = m[1];
  const base64 = dataUrl.slice(m[0].length);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > 2 * 1024 * 1024) {
    return { ok: false, message: "El logo no puede superar 2MB" };
  }
  const ext = EXT[mime] ?? "png";
  const admin = createAdminClient();
  const path = `${profile.company_id}/logo-${Date.now()}.${ext}`;
  const { error } = await admin.storage
    .from("form-assets")
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (error) return { ok: false, message: error.message };
  const { data: pub } = admin.storage.from("form-assets").getPublicUrl(path);
  return { ok: true, url: pub.publicUrl };
}

/** Compat: server action con useActionState — la dejo por si la necesitamos. */
export async function updateOperationalCompany(
  _prev: UpdateCompanyState | undefined,
  formData: FormData,
): Promise<UpdateCompanyState> {
  const result = await saveCompanyOperational({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    logo_url: String(formData.get("logo_url") ?? ""),
  });
  if (!result.ok) return { formError: result.message };
  return { success: true };
}

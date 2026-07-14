"use server";

// ============================================================================
// Documentación de la venta: registrar/eliminar archivos. El archivo se sube al
// bucket `sale-docs` desde el cliente (RLS por company_id en el path); acá se
// guarda/borra el registro y se genera la signed URL para previsualizar.
// ============================================================================

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "sale-docs";
const DOC_ROLES = ["admin", "manager", "supervisor", "sales"] as const;

function revalidateSale(leadId: string, saleId: string) {
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath(`/manager/sales/${saleId}`);
  revalidatePath(`/admin/sales/${saleId}`);
}

export async function addSaleDocument(
  saleId: string,
  input: { kind: "dni" | "other"; title: string; filePath: string; mimeType?: string },
): Promise<{ ok: boolean; message?: string; id?: string }> {
  const profile = await requireRole([...DOC_ROLES]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Poné un nombre al archivo" };

  const supabase = await createClient();
  // La venta (para saber el lead y revalidar). RLS asegura visibilidad.
  const { data: sale } = await supabase
    .from("sales")
    .select("id, lead_id")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return { ok: false, message: "Venta no encontrada" };

  const { data, error } = await supabase
    .from("sale_documents")
    .insert({
      sale_id: saleId,
      company_id: profile.company_id,
      kind: input.kind,
      title,
      file_path: input.filePath,
      mime_type: input.mimeType ?? null,
      uploaded_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "No pude guardar el archivo" };
  }

  revalidateSale(sale.lead_id, saleId);
  return { ok: true, id: data.id };
}

export async function deleteSaleDocument(
  docId: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireRole([...DOC_ROLES]);
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("sale_documents")
    .select("id, file_path, sale_id, sales(lead_id)")
    .eq("id", docId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "Archivo no encontrado" };

  const { error } = await supabase
    .from("sale_documents")
    .delete()
    .eq("id", docId);
  if (error) return { ok: false, message: error.message };

  // Borrar el archivo del storage (admin client).
  await createAdminClient().storage.from(BUCKET).remove([doc.file_path]);

  const leadId = (doc.sales as { lead_id: string } | null)?.lead_id ?? "";
  if (leadId) revalidateSale(leadId, doc.sale_id);
  return { ok: true };
}

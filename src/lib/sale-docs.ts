// Carga los documentos de una venta con signed URLs (bucket privado sale-docs).
// Server-only (recibe el cliente supabase). Ver components/sales/sale-documents.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SaleDoc } from "@/components/sales/sale-documents";
import type { Database } from "@/types/database";

export async function loadSaleDocs(
  client: SupabaseClient<Database>,
  saleId: string,
): Promise<SaleDoc[]> {
  const { data } = await client
    .from("sale_documents")
    .select("id, kind, title, file_path, mime_type")
    .eq("sale_id", saleId)
    .order("created_at", { ascending: true });

  const docs = data ?? [];
  return Promise.all(
    docs.map(async (d) => {
      const { data: signed } = await client.storage
        .from("sale-docs")
        .createSignedUrl(d.file_path, 60 * 60);
      return {
        id: d.id,
        kind: d.kind,
        title: d.title,
        filePath: d.file_path,
        mimeType: d.mime_type,
        url: signed?.signedUrl ?? null,
      };
    }),
  );
}

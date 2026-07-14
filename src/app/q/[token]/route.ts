import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

// Link público y estable de un presupuesto: sirve el PDF inline por share_token.
// No requiere auth (se comparte con el cliente). Ver quote/actions getQuoteShareUrl.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return new NextResponse("No encontrado", { status: 404 });

  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("pdf_path")
    .eq("share_token", token)
    .maybeSingle();
  if (!quote?.pdf_path) {
    return new NextResponse("Presupuesto no encontrado", { status: 404 });
  }

  const { data: blob, error } = await admin.storage
    .from("quotes")
    .download(quote.pdf_path);
  if (error || !blob) {
    return new NextResponse("Presupuesto no disponible", { status: 404 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=presupuesto.pdf",
      "Cache-Control": "public, max-age=300",
    },
  });
}

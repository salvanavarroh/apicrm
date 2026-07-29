import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { fetchMedia } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

// Proxy de adjuntos del inbox. El browser NUNCA toca la URL cruda de Zernio
// (los media de WhatsApp requieren el API key). Acá autenticamos al usuario,
// verificamos que el mensaje sea de su empresa, bajamos el media con el Bearer
// y lo streameamos con su Content-Type. `?dl=1` fuerza descarga.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Attachment = {
  url?: string;
  type?: string;
  payload?: { mimeType?: string } | null;
};

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.company_id) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const url = new URL(req.url);
  const msgId = url.searchParams.get("msg");
  const idx = Number(url.searchParams.get("i") ?? "0");
  const download = url.searchParams.get("dl") === "1";
  if (!msgId) return new NextResponse("Falta msg", { status: 400 });

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("company_id, attachments")
    .eq("id", msgId)
    .maybeSingle();

  // Autorización: el mensaje debe ser de la empresa del usuario.
  if (!message || message.company_id !== profile.company_id) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Attachment[])
    : [];
  const att = attachments[idx];
  if (!att?.url) return new NextResponse("Adjunto no encontrado", { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetchMedia(att.url);
  } catch {
    return new NextResponse("No se pudo bajar el adjunto", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // Meta firma sus URLs con expiración; un 403/410 suele ser eso.
    return new NextResponse("El adjunto ya no está disponible", {
      status: upstream.status === 404 ? 404 : 410,
    });
  }

  const contentType =
    upstream.headers.get("content-type") ??
    att.payload?.mimeType ??
    "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  if (download) headers.set("Content-Disposition", "attachment");

  return new NextResponse(upstream.body, { status: 200, headers });
}

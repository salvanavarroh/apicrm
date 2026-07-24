import { after, NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { dispatchEvent } from "@/lib/messaging/dispatch";
import {
  SIGNATURE_HEADERS,
  extractEventId,
  getHeader,
  verifyZernioSignature,
} from "@/lib/messaging/zernio-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook único global de Zernio (inbox WhatsApp/IG/FB + Lead Ads).
// Regla de oro: verificar firma → deduplicar → responder 200 (< 5 s) → procesar
// asíncrono. NUNCA procesar inline. Ver docs/mensajeria-zernio-arquitectura.md §6.2.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check / verificación simple (Zernio no usa challenge GET, pero sirve
// para confirmar que el endpoint está vivo desde el navegador).
export async function GET() {
  return NextResponse.json({ ok: true, service: "zernio-webhook" });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const env = getServerEnv();

  // 1) Verificar firma HMAC (si hay secret configurado).
  const secret = env.ZERNIO_WEBHOOK_SECRET;
  if (secret) {
    const signature = getHeader(req.headers, SIGNATURE_HEADERS);
    if (!verifyZernioSignature(rawBody, signature, secret)) {
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }
  } else {
    // Sin secret: no podemos verificar. Se acepta sólo para pruebas iniciales.
    console.warn("[zernio-webhook] ZERNIO_WEBHOOK_SECRET no configurado — firma NO verificada");
  }

  // 2) Parsear.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventType = typeof payload.event === "string" ? payload.event : "unknown";
  const eventId = extractEventId(payload, req.headers);

  const admin = createAdminClient();

  // 3) Deduplicar (idempotencia at-least-once). Insert con PK = event_id.
  if (eventId) {
    const { error } = await admin.from("webhook_events").insert({
      event_id: eventId,
      provider: "zernio",
      event_type: eventType,
      payload: payload as never,
      status: "received",
    });
    // Conflicto de PK => ya lo vimos: ACK y salir sin reprocesar.
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, deduped: true });
      }
      // Otro error de DB: logueamos pero igual ACKeamos para no forzar reintentos
      // eternos de Zernio; queda para revisar en logs.
      console.error("[zernio-webhook] error guardando evento:", error.message);
    }
  } else {
    console.warn(`[zernio-webhook] evento ${eventType} sin id — no se deduplica`);
  }

  // 4) ACK inmediato (< 5 s). El procesamiento (lead.received, message.received,
  //    account.connected, …) corre en after(), después de responder.
  after(async () => {
    await dispatchEvent(eventType, payload, eventId);
  });

  return NextResponse.json({ ok: true, event: eventType });
}

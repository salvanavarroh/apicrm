import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyMotorboxWebhook } from "@/lib/motorbox/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Eventos de intención de Motorbox: alguien tocó el CTA de una publicación.
//
// Sirve para una sola cosa, pero importante: comparar clics contra leads
// efectivamente atribuidos, y así saber cuánta atribución se pierde cuando el
// comprador borra el marcador [MB:xxxx] antes de mandar el mensaje.
//
// Contrato: docs/motorbox-spec-motorbox.md §10.5.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event_id: z.string().min(1).max(200),
  type: z.string().min(1).max(80),
  company_id: z.string().uuid(),
  channel: z.string().max(40).nullish(),
  listing_code: z.string().max(40).nullish(),
  occurred_at: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  const rawBody = await req.text();
  const verified = verifyMotorboxWebhook(rawBody, req.headers);
  if (!verified.ok) {
    const status = verified.reason === "not_configured" ? 503 : 401;
    return NextResponse.json({ ok: false, error: verified.reason }, { status });
  }

  const result = bodySchema.safeParse(
    await (async () => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })(),
  );
  if (!result.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const event = result.data;

  const admin = createAdminClient();
  const { error } = await admin.from("motorbox_events").insert({
    company_id: event.company_id,
    event_id: event.event_id,
    type: event.type,
    channel: event.channel ?? null,
    listing_code: event.listing_code ?? null,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
  });

  // Ya lo teníamos: el reintento de Motorbox es correcto, no un error.
  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, deduped: true });
  }
  if (error) {
    // FK rota = company_id que no existe. No tiene sentido que reintenten.
    if (error.code === "23503") {
      return NextResponse.json(
        { ok: false, error: "company_not_found" },
        { status: 404 },
      );
    }
    console.error("[motorbox] evento no guardado:", error.message);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deduped: false });
}

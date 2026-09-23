import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import {
  appendLeadVehicle,
  findReentryLead,
  resolveCompanyE164,
} from "@/lib/lead-reentry";
import { ensureMotorboxCampaign } from "@/lib/motorbox/attribution";
import { verifyMotorboxWebhook } from "@/lib/motorbox/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

// ============================================================================
// Ingesta de leads desde Motorbox (server-to-server).
//
// Para los CTA que NO son WhatsApp: formulario, consulta por mail, etc. En v1
// Motorbox sólo ofrece WhatsApp, así que esto vive detrás de un flag apagado;
// el lead de WhatsApp entra por el inbox y se atribuye con el marcador
// [MB:xxxx] (ver src/lib/motorbox/attribution.ts).
//
// Sigue la regla de oro de los webhooks del repo (mensajeria-zernio-arquitectura
// §6.2): verificar firma → deduplicar → responder 200 → procesar asíncrono.
//
// Contrato: docs/motorbox-spec-motorbox.md §11.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event_id: z.string().min(1).max(200),
  company_id: z.string().uuid(),
  channel: z.string().max(40).optional(),
  listing: z
    .object({
      public_code: z.string().max(40).optional(),
      url: z.string().max(500).optional(),
      brand: z.string().max(120).nullish(),
      model: z.string().max(120).nullish(),
      version: z.string().max(200).nullish(),
      year: z.number().int().nullish(),
      price: z.number().nullish(),
      // Motorbox admite las dos y no convierte: la moneda viaja con el precio.
      currency: z.enum(["ARS", "USD"]).nullish(),
    })
    .optional(),
  contact: z.object({
    first_name: z.string().max(120).nullish(),
    last_name: z.string().max(120).nullish(),
    phone_e164: z.string().max(40).nullish(),
    email: z.string().email().max(200).nullish(),
  }),
  message: z.string().max(4000).nullish(),
  api_crm_branch_id: z.string().uuid().nullish(),
  occurred_at: z.string().max(60).optional(),
});

type Body = z.infer<typeof bodySchema>;

function describe(listing: Body["listing"]): string | null {
  if (!listing) return null;
  const parts = [listing.brand, listing.model, listing.version, listing.year]
    .filter(Boolean)
    .join(" ");
  const bits = [parts || "Vehículo"];
  if (listing.price != null) {
    bits.push(`${listing.currency ?? "ARS"} ${listing.price.toLocaleString("es-AR")}`);
  }
  if (listing.url) bits.push(listing.url);
  return bits.join(" · ");
}

export async function POST(req: Request) {
  if (!getServerEnv().MOTORBOX_LEAD_INGEST_ENABLED) {
    // 503 explícito para que el otro lado lo distinga de un bug suyo.
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
  }

  const rawBody = await req.text();
  const verified = verifyMotorboxWebhook(rawBody, req.headers);
  if (!verified.ok) {
    const status = verified.reason === "not_configured" ? 503 : 401;
    return NextResponse.json({ ok: false, error: verified.reason }, { status });
  }

  let parsed: Body;
  try {
    const result = bodySchema.safeParse(JSON.parse(rawBody));
    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: "invalid_body", detail: result.error.issues[0]?.message },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Dedup por event_id, con la misma tabla que usa el webhook de Zernio.
  const { error: dedupError } = await admin.from("webhook_events").insert({
    event_id: parsed.event_id,
    provider: "motorbox",
    event_type: "lead.created",
    payload: parsed as unknown as Json,
    status: "received",
  });
  if (dedupError?.code === "23505") {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const { data: company } = await admin
    .from("companies")
    .select("id, status")
    .eq("id", parsed.company_id)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ ok: false, error: "company_not_found" }, { status: 404 });
  }
  if (company.status !== "active") {
    return NextResponse.json({ ok: false, error: "company_suspended" }, { status: 403 });
  }

  const { contact } = parsed;
  if (!contact.phone_e164 && !contact.email) {
    return NextResponse.json(
      { ok: false, error: "contact_without_identifier" },
      { status: 400 },
    );
  }

  // Teléfono canónico. Motorbox debería mandarlo ya en E.164; si no, lo
  // normalizamos con el país de la empresa, igual que el resto del CRM.
  const phoneE164 = contact.phone_e164?.startsWith("+")
    ? contact.phone_e164
    : await resolveCompanyE164(admin, company.id, contact.phone_e164 ?? null);
  const email = contact.email?.trim().toLowerCase() ?? null;

  // Reingreso: si la persona ya entró en los últimos 31 días, es el MISMO lead
  // (conserva su vendedor). Pasa seguido acá: consultó por WhatsApp y después
  // mandó el formulario.
  const reentry = await findReentryLead(admin, company.id, phoneE164, email);
  const vehicle = {
    vehicle_brand: parsed.listing?.brand ?? null,
    vehicle_model: parsed.listing?.model ?? null,
    vehicle_version: parsed.listing?.version ?? null,
    notes: describe(parsed.listing),
  };

  if (reentry) {
    await appendLeadVehicle(admin, reentry.id, company.id, vehicle);
    if (parsed.message) {
      await admin.from("lead_notes").insert({
        lead_id: reentry.id,
        company_id: company.id,
        content: `Desde Motorbox: ${parsed.message}`,
        activity_type: "other",
      });
    }
    return NextResponse.json({ ok: true, lead_id: reentry.id, deduped: true });
  }

  const campaignId = await ensureMotorboxCampaign(admin, company.id);
  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      company_id: company.id,
      branch_id: parsed.api_crm_branch_id ?? null,
      campaign_id: campaignId,
      first_name: contact.first_name ?? null,
      last_name: contact.last_name ?? null,
      phone: contact.phone_e164 ?? null,
      phone_e164: phoneE164,
      email,
      source: "Motorbox",
      status: "new",
      initial_notes: parsed.message ?? null,
      vehicle_brand: parsed.listing?.brand ?? null,
      vehicle_model: parsed.listing?.model ?? null,
      vehicle_version: parsed.listing?.version ?? null,
      metadata: {
        motorbox: {
          listing_code: parsed.listing?.public_code ?? null,
          listing_url: parsed.listing?.url ?? null,
          // Precio Y moneda, siempre juntos.
          price: parsed.listing?.price ?? null,
          currency: parsed.listing?.currency ?? null,
          channel: parsed.channel ?? null,
          matched_at: new Date().toISOString(),
        },
      } as Json,
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("[motorbox] no se pudo crear el lead:", error?.message);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  await appendLeadVehicle(admin, lead.id, company.id, vehicle);

  // La asignación va después de responder: no tiene por qué demorar el ACK.
  after(async () => {
    await admin.rpc("auto_assign_lead", { p_lead_id: lead.id });
  });

  return NextResponse.json({ ok: true, lead_id: lead.id, deduped: false });
}

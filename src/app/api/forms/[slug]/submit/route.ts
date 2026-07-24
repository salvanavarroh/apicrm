import { NextResponse } from "next/server";

import { parseFields, submissionSchema } from "@/lib/forms";
import {
  appendLeadVehicle,
  findReentryLead,
  resolveCompanyE164,
} from "@/lib/lead-reentry";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limit muy básico en memoria por instancia. 1 submission por IP cada 60s.
// Suficiente para parar bots simples; en alto tráfico habría que mover a Redis
// o KV (Vercel Edge KV).
const submitWindow = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || slug.length < 4) {
    return NextResponse.json({ ok: false, message: "Slug inválido" }, { status: 400 });
  }

  // Rate limit
  const ip = getIp(req);
  const key = `${ip}:${slug}`;
  const last = submitWindow.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) {
    return NextResponse.json(
      { ok: false, message: "Demasiados intentos. Esperá un minuto." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON inválido" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Honeypot: si el bot llenó el campo "website" lo descartamos silenciosamente.
  if (data.website && data.website.trim().length > 0) {
    submitWindow.set(key, now);
    return NextResponse.json({ ok: true });
  }

  // Buscar el form activo.
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("lead_capture_forms")
    .select(
      "id, company_id, branch_id, product_type_id, campaign_id, status, fields, success_message",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!form || form.status !== "active") {
    return NextResponse.json(
      { ok: false, message: "El formulario no está disponible." },
      { status: 404 },
    );
  }

  const fields = parseFields(form.fields);

  // Validar required configurables del form.
  const errors: string[] = [];
  for (const [key, cfg] of Object.entries(fields)) {
    if (!cfg.required) continue;
    const val = (data as Record<string, string | undefined>)[key];
    if (!val || val.trim().length === 0) {
      errors.push(`${cfg.label} es obligatorio`);
    }
  }
  if (!data.phone && !data.email) {
    errors.push("Necesitamos teléfono o email para contactarte");
  }
  if (errors.length > 0) {
    return NextResponse.json(
      { ok: false, message: errors[0] },
      { status: 400 },
    );
  }

  // Normaliza un tracking field: trim, vacío → null, truncar a 500.
  const trk = (v: string | undefined) =>
    v && v.trim() ? v.trim().slice(0, 500) : null;

  const cleanPhone = data.phone ? data.phone.replace(/[^\d+]/g, "") : null;
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : null;
  // Teléfono canónico E.164 según el país de la empresa (dedup cross-canal).
  const phoneE164 = await resolveCompanyE164(admin, form.company_id, data.phone);

  // Reingreso (#5/#6): si el mismo cliente ya entró dentro de la ventana, es el
  // MISMO lead. Le agregamos la consulta (auto) y conserva su vendedor — no
  // creamos un lead nuevo ni re-asignamos.
  const reentry = await findReentryLead(
    admin,
    form.company_id,
    cleanPhone,
    cleanEmail,
  );
  if (reentry) {
    await appendLeadVehicle(admin, reentry.id, form.company_id, {
      vehicle_model: data.vehicle_model || null,
      notes: data.initial_notes || null,
    });
    await admin.from("lead_submissions").insert({
      lead_id: reentry.id,
      company_id: form.company_id,
      campaign_id: form.campaign_id,
      data_snapshot: {
        ...data,
        _source: "public_form",
        _form_id: form.id,
        _ip: ip,
        _reentry: true,
      } as Record<string, unknown> as never,
    });
    await admin.rpc("increment_form_submissions", { p_form_id: form.id });
    submitWindow.set(key, now);
    return NextResponse.json({
      ok: true,
      message: form.success_message ?? "Recibimos tus datos.",
    });
  }

  // Insertar lead.
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      company_id: form.company_id,
      branch_id: form.branch_id,
      product_type_id: form.product_type_id,
      campaign_id: form.campaign_id,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      phone: cleanPhone,
      phone_e164: phoneE164,
      email: cleanEmail,
      city: data.city || null,
      vehicle_model: data.vehicle_model || null,
      initial_notes: data.initial_notes || null,
      status: "new",
      utm_source: trk(data.utm_source),
      utm_medium: trk(data.utm_medium),
      utm_campaign: trk(data.utm_campaign),
      utm_term: trk(data.utm_term),
      utm_content: trk(data.utm_content),
      landing_url: trk(data.landing_url),
      referrer: trk(data.referrer),
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { ok: false, message: leadError?.message ?? "Error guardando el lead" },
      { status: 500 },
    );
  }

  // Primera consulta (auto) del lead.
  await appendLeadVehicle(admin, lead.id, form.company_id, {
    vehicle_model: data.vehicle_model || null,
  });

  // Submission record + auto-assign si la gerencia lo tiene activo.
  await admin.from("lead_submissions").insert({
    lead_id: lead.id,
    company_id: form.company_id,
    campaign_id: form.campaign_id,
    data_snapshot: {
      ...data,
      _source: "public_form",
      _form_id: form.id,
      _ip: ip,
    } as Record<string, unknown> as never,
  });
  await admin.rpc("auto_assign_lead", { p_lead_id: lead.id });

  // Incremento atómico de submissions_count vía SQL.
  await admin.rpc("increment_form_submissions", { p_form_id: form.id });

  submitWindow.set(key, now);
  return NextResponse.json({
    ok: true,
    message: form.success_message ?? "Recibimos tus datos.",
  });
}

import { NextResponse } from "next/server";

import { commercialLeadSubmissionSchema } from "@/lib/commercial-leads";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limit en memoria por instancia (1 submit por IP cada 60s).
const submitWindow = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

const trk = (v: string | undefined) =>
  v && v.trim() ? v.trim().slice(0, 500) : null;

export async function POST(req: Request) {
  const ip = getIp(req);
  const last = submitWindow.get(ip);
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
    return NextResponse.json(
      { ok: false, message: "JSON inválido" },
      { status: 400 },
    );
  }

  const parsed = commercialLeadSubmissionSchema.safeParse(body);
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

  // Honeypot — bots llenan "website".
  if (data.website && data.website.trim().length > 0) {
    submitWindow.set(ip, now);
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("commercial_leads").insert({
    first_name: data.first_name.trim(),
    last_name: data.last_name?.trim() || null,
    email: data.email.trim().toLowerCase(),
    company_name: data.company_name?.trim() || null,
    phone: data.phone?.trim() || null,
    team_size: data.team_size?.trim() || null,
    message: data.message?.trim() || null,
    status: "new",
    utm_source: trk(data.utm_source),
    utm_medium: trk(data.utm_medium),
    utm_campaign: trk(data.utm_campaign),
    utm_term: trk(data.utm_term),
    utm_content: trk(data.utm_content),
    landing_url: trk(data.landing_url),
    referrer: trk(data.referrer),
  });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );
  }

  submitWindow.set(ip, now);
  return NextResponse.json({
    ok: true,
    message: "Recibimos tu mensaje. Te contactamos dentro de las próximas 24 hs hábiles.",
  });
}

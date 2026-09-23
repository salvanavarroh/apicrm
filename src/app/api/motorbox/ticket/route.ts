import { after, NextResponse } from "next/server";

import { getCurrentProfile, hasRole } from "@/lib/auth";
import { motorboxReady } from "@/lib/motorbox/config";
import { markMotorboxEnabled } from "@/lib/motorbox/notify";
import { rateLimit } from "@/lib/motorbox/rate-limit";
import { buildSsoUrl, resolveUserEmail } from "@/lib/motorbox/ticket";
import { createAdminClient } from "@/lib/supabase/admin";

// Emite un ticket SSO para entrar a Motorbox. Lo llama la página del iframe al
// montar, y de nuevo cada vez que Motorbox avisa que se le venció la sesión
// (mensaje `motorbox:need-ticket`).
//
// NUNCA loguear el ticket ni la URL completa: el ticket ES la credencial.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  // Sólo admin y group_admin. `hasRole` ya traduce group_admin → admin.
  if (!hasRole(profile, ["admin"])) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const limit = rateLimit(`motorbox:ticket:${profile.id}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const ready = motorboxReady();
  if (!ready.ok) {
    console.error("[motorbox] falta configuración:", ready.missing.join(", "));
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // Un group_admin sin marca activa tiene company_id null (ver getCurrentProfile):
  // no hay concesionaria que dar de alta en Motorbox. Error explícito, no un
  // ticket con company vacía que el otro lado no sabe interpretar.
  if (!profile.company_id) {
    return NextResponse.json({ ok: false, error: "no_active_company" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id, name, country, status")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ ok: false, error: "company_not_found" }, { status: 404 });
  }
  if (company.status !== "active") {
    return NextResponse.json({ ok: false, error: "company_suspended" }, { status: 403 });
  }

  const email = await resolveUserEmail(admin, profile.id);
  if (!email) {
    // Sin email Motorbox no puede crear la cuenta del otro lado.
    return NextResponse.json({ ok: false, error: "user_without_email" }, { status: 400 });
  }

  let body: { state?: string; embed?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* body opcional */
  }

  try {
    const url = await buildSsoUrl({
      profile,
      email,
      company,
      embed: body.embed !== false,
      state: body.state,
    });
    // La primera vez que alguien de esta empresa entra, la marcamos como
    // usuaria de Motorbox: es lo que filtra a quién le mandamos webhooks.
    // Va en after() para no sumarle latencia al ticket.
    after(async () => {
      await markMotorboxEnabled(company.id);
    });
    return NextResponse.json(
      { ok: true, url },
      { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
    );
  } catch (e) {
    // El mensaje puede nombrar una env var, nunca su valor.
    console.error("[motorbox] no se pudo emitir el ticket:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "mint_failed" }, { status: 500 });
  }
}

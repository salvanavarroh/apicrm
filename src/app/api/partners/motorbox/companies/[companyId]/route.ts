import { NextResponse } from "next/server";

import { isMotorboxRequest } from "@/lib/motorbox/auth";
import { loadCompanyProfile } from "@/lib/motorbox/company-profile";

// Perfil de una concesionaria, para que Motorbox prellene su onboarding.
// Server-to-server, autenticado con MOTORBOX_PARTNER_KEY.
//
// Contrato: docs/motorbox-spec-motorbox.md §6.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  if (!isMotorboxRequest(req)) {
    // Sin pistas sobre si la empresa existe: el 401 es igual en los dos casos.
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  if (!UUID.test(companyId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const profile = await loadCompanyProfile(companyId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, ...profile },
    { headers: { "cache-control": "no-store" } },
  );
}

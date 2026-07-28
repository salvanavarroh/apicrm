import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { syncCompanyChannels } from "@/lib/messaging/sync-channels";
import { getNumberInfo, type ZernioPlatform } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

// Callback del connect flow de Zernio. El BROWSER del admin vuelve acá con
// ?connected=<platform>&accountId=...&profileId=...&username=...
// Además de crear el canal recién conectado, sincroniza TODAS las cuentas de
// Zernio (Facebook crea también metaads/instagram) con foto y estado.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ZernioPlatform[] = ["whatsapp", "instagram", "facebook"];

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  const url = new URL(req.url);
  const base = url.origin;

  if (!profile || profile.role !== "admin" || !profile.company_id) {
    return NextResponse.redirect(`${base}/login`);
  }

  const platform = url.searchParams.get("connected") as ZernioPlatform | null;
  const accountId = url.searchParams.get("accountId");
  const username = url.searchParams.get("username");

  if (!platform || !VALID.includes(platform) || !accountId) {
    return NextResponse.redirect(`${base}/admin/integraciones?error=connect_failed`);
  }

  const admin = createAdminClient();
  // Upsert inmediato del canal recién conectado.
  await admin.from("messaging_channels").upsert(
    {
      company_id: profile.company_id,
      zernio_account_id: accountId,
      platform,
      external_ref: username,
      display_name: username,
      status: "active",
      connected_by: profile.id,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "zernio_account_id" },
  );

  // Sincronizar todas las cuentas de Zernio (metaads, fotos, otras redes).
  const { data: company } = await admin
    .from("companies")
    .select("zernio_profile_id")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (company?.zernio_profile_id) {
    try {
      await syncCompanyChannels(profile.company_id, company.zernio_profile_id);
    } catch {
      /* best-effort */
    }
  }

  // Salud inicial (WhatsApp): quality/tier/name.
  if (platform === "whatsapp") {
    try {
      const info = await getNumberInfo(accountId);
      await admin
        .from("messaging_channels")
        .update({
          quality_rating: info.quality_rating ?? null,
          messaging_limit_tier: info.messaging_limit_tier ?? null,
          name_status: info.name_status ?? null,
          health_checked_at: new Date().toISOString(),
        })
        .eq("zernio_account_id", accountId);
    } catch {
      /* no-op */
    }
  }

  return NextResponse.redirect(`${base}/admin/integraciones?connected=1`);
}

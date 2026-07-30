// Sincroniza los canales del CRM con las cuentas conectadas en Zernio.
// Al conectar Facebook, Zernio crea varias cuentas (facebook, instagram, metaads,
// whatsapp); esto las trae todas con su foto de perfil y estado. Server-only.

import { listAccounts } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Platform = Database["public"]["Enums"]["channel_platform"];
const SUPPORTED: Platform[] = [
  "whatsapp",
  "instagram",
  "facebook",
  "metaads",
  "tiktok",
  "google",
];

// Zernio puede devolver la plataforma de ads con o sin sufijo (-ads) → la
// normalizamos al valor del enum.
function normalizePlatform(raw: string): Platform | null {
  const p = raw.toLowerCase();
  if (p.startsWith("tiktok")) return "tiktok";
  if (p.startsWith("google")) return "google";
  return SUPPORTED.includes(p as Platform) ? (p as Platform) : null;
}

export async function syncCompanyChannels(
  companyId: string,
  profileId: string,
): Promise<number> {
  const admin = createAdminClient();
  const res = await listAccounts(profileId);
  let synced = 0;
  for (const a of res.accounts ?? []) {
    const platform = a.platform ? normalizePlatform(a.platform) : null;
    if (!platform) continue;
    const accId = a._id ?? a.accountId;
    if (!accId) continue;
    const active = a.needsReconnection
      ? false
      : (a.isActive ?? a.enabled ?? true);
    await admin.from("messaging_channels").upsert(
      {
        company_id: companyId,
        zernio_account_id: accId,
        platform,
        external_ref: a.username ?? a.displayName ?? null,
        display_name: a.displayName ?? a.username ?? null,
        photo_url: a.profilePicture ?? null,
        status: active ? "active" : "disconnected",
      },
      { onConflict: "zernio_account_id" },
    );
    synced++;
  }
  return synced;
}

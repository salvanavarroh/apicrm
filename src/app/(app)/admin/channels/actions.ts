"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import {
  createProfile,
  deleteAccount,
  getConnectUrl,
  getNumberInfo,
  purchasePhoneNumber,
  ZernioError,
  type ZernioPlatform,
} from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

/** Asegura que la empresa tenga un profile en Zernio; lo crea si falta. */
async function ensureProfile(companyId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id, name, zernio_profile_id")
    .eq("id", companyId)
    .maybeSingle();
  if (company?.zernio_profile_id) return company.zernio_profile_id;

  const res = await createProfile(companyId, company?.name ?? undefined);
  const profileId = res.profile._id;
  await admin
    .from("companies")
    .update({ zernio_profile_id: profileId })
    .eq("id", companyId);
  return profileId;
}

/** Inicia el connect flow de una plataforma. Devuelve la authUrl para redirigir. */
export async function startConnect(
  platform: ZernioPlatform,
): Promise<Result<{ authUrl: string }>> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };
  try {
    const profileId = await ensureProfile(profile.company_id);
    const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { authUrl } = await getConnectUrl(
      platform,
      profileId,
      `${appUrl}/api/channels/callback`,
    );
    return { ok: true, authUrl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error conectando" };
  }
}

/**
 * Compra/provisiona un número de WhatsApp vía Zernio para la empresa.
 * En países regulados (AR) devuelve un link de KYC en vez de cobrar de una.
 */
export async function startBuyNumber(): Promise<
  Result<{ kycUrl?: string; status?: string; message?: string }>
> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };
  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("country")
    .eq("id", profile.company_id)
    .maybeSingle();
  const country = (company?.country ?? "AR").toUpperCase();
  try {
    const profileId = await ensureProfile(profile.company_id);
    const res = await purchasePhoneNumber({
      profileId,
      country,
      connectWhatsapp: true,
    });
    return { ok: true, kycUrl: res.kycUrl, status: res.status, message: res.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error comprando número";
    return { ok: false, message: msg };
  }
}

/** Refresca la salud (quality/tier/name) de un canal de WhatsApp. */
export async function refreshChannelHealth(channelId: string): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("messaging_channels")
    .select("id, company_id, zernio_account_id, platform")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.company_id !== profile.company_id) {
    return { ok: false, message: "Canal no encontrado" };
  }
  if (channel.platform !== "whatsapp") return { ok: true };
  try {
    const info = await getNumberInfo(channel.zernio_account_id);
    await admin
      .from("messaging_channels")
      .update({
        quality_rating: info.quality_rating ?? null,
        messaging_limit_tier: info.messaging_limit_tier ?? null,
        name_status: info.name_status ?? null,
        health_checked_at: new Date().toISOString(),
      })
      .eq("id", channelId);
    revalidatePath("/admin/channels");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error" };
  }
}

/**
 * Desconecta un canal DE VERDAD: borra la cuenta en Zernio (corta recepción y
 * facturación) y marca el canal como desconectado. Un 404 en Zernio significa
 * que ya estaba desconectada → se trata como éxito.
 */
export async function disconnectChannel(channelId: string): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("messaging_channels")
    .select("company_id, zernio_account_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.company_id !== profile.company_id) {
    return { ok: false, message: "Canal no encontrado" };
  }

  try {
    await deleteAccount(channel.zernio_account_id);
  } catch (e) {
    // Si ya no existe en Zernio (404), seguimos; cualquier otro error se reporta.
    if (!(e instanceof ZernioError && e.status === 404)) {
      return {
        ok: false,
        message: `No se pudo desconectar en Zernio: ${e instanceof Error ? e.message : "error"}. Reintentá.`,
      };
    }
  }

  await admin
    .from("messaging_channels")
    .update({ status: "disconnected" })
    .eq("id", channelId);
  revalidatePath("/admin/channels/whatsapp");
  revalidatePath("/admin/channels/instagram");
  revalidatePath("/admin/channels/facebook");
  return { ok: true };
}

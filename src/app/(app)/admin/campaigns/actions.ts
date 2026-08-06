"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ORIGINS = [
  "meta_ads",
  "google_ads",
  "whatsapp",
  "showroom",
  "referral",
  "web",
  "email",
  "instagram",
  "tiktok_ads",
  "marketplace",
  "portal_usados",
  "inbound_call",
  "other",
] as const;

const inputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(2, "Nombre obligatorio"),
    origin: z.enum(ORIGINS),
    origin_other: z.string().optional().or(z.literal("")),
    product_type_id: z.string().uuid().optional().or(z.literal("")),
    branch_id: z.string().uuid().optional().or(z.literal("")),
    // Varias sucursales (reparto round-robin). Si viene, manda sobre branch_id.
    branch_ids: z.array(z.string().uuid()).optional(),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .refine((d) => d.origin !== "other" || Boolean(d.origin_other?.trim()), {
    message: "Especificá el origen cuando elegís “Otros”",
    path: ["origin_other"],
  });

export type CampaignInput = z.input<typeof inputSchema>;
export type CampaignResult =
  | { ok: true }
  | { ok: false; message: string };

export async function upsertCampaign(
  input: CampaignInput,
): Promise<CampaignResult> {
  const profile = await requireRole(["admin"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = await createClient();
  const branchIds = parsed.data.branch_ids?.length
    ? parsed.data.branch_ids
    : parsed.data.branch_id
      ? [parsed.data.branch_id]
      : [];
  const payload = {
    company_id: profile.company_id,
    name: parsed.data.name.trim(),
    origin: parsed.data.origin,
    origin_other:
      parsed.data.origin === "other"
        ? (parsed.data.origin_other?.trim() ?? null)
        : null,
    product_type_id: parsed.data.product_type_id || null,
    // Sucursal "primaria" (compat/display); el set completo va a campaign_branches.
    branch_id: branchIds[0] ?? null,
    status: parsed.data.status,
  };

  let campaignId = parsed.data.id;
  if (campaignId) {
    const { error } = await supabase
      .from("campaigns")
      .update(payload)
      .eq("id", campaignId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data, error } = await supabase
      .from("campaigns")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: error?.message ?? "No se pudo crear" };
    campaignId = data.id;
  }

  // Reemplaza el set de sucursales de la campaña (para el reparto round-robin).
  await supabase.from("campaign_branches").delete().eq("campaign_id", campaignId);
  if (branchIds.length) {
    const { error: jerr } = await supabase.from("campaign_branches").insert(
      branchIds.map((b) => ({
        campaign_id: campaignId!,
        branch_id: b,
        company_id: profile.company_id!,
      })),
    );
    if (jerr) return { ok: false, message: jerr.message };
  }

  revalidatePath("/admin/campaigns");
  return { ok: true };
}

export async function toggleCampaignStatus(
  id: string,
  next: "active" | "inactive",
): Promise<CampaignResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/campaigns");
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<CampaignResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/campaigns");
  return { ok: true };
}

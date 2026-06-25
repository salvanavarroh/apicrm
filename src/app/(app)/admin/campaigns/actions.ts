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
  const payload = {
    company_id: profile.company_id,
    name: parsed.data.name.trim(),
    origin: parsed.data.origin,
    origin_other:
      parsed.data.origin === "other"
        ? (parsed.data.origin_other?.trim() ?? null)
        : null,
    product_type_id: parsed.data.product_type_id || null,
    branch_id: parsed.data.branch_id || null,
    status: parsed.data.status,
  };

  const { error } = parsed.data.id
    ? await supabase.from("campaigns").update(payload).eq("id", parsed.data.id)
    : await supabase.from("campaigns").insert(payload);

  if (error) return { ok: false, message: error.message };

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

"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; message: string };

/** Crea/actualiza el mapeo de un formulario de Meta Lead Ads → routing. */
export async function upsertLeadAdForm(input: {
  metaFormId: string;
  formName?: string;
  branchId?: string;
  productTypeId?: string;
  campaignId?: string;
}): Promise<Result> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const metaFormId = input.metaFormId.trim();
  if (!metaFormId) return { ok: false, message: "Falta el ID del formulario de Meta" };

  const { error } = await admin.from("lead_ad_forms").upsert(
    {
      company_id: profile.company_id!,
      meta_form_id: metaFormId,
      form_name: input.formName?.trim() || null,
      branch_id: input.branchId || null,
      product_type_id: input.productTypeId || null,
      campaign_id: input.campaignId || null,
    },
    { onConflict: "company_id,meta_form_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/lead-ads");
  return { ok: true };
}

export async function deleteLeadAdForm(id: string): Promise<Result> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("lead_ad_forms")
    .delete()
    .eq("id", id)
    .eq("company_id", profile.company_id!);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/lead-ads");
  return { ok: true };
}

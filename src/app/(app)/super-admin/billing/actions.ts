"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type BillingResult =
  | { ok: true }
  | { ok: false; message: string };

export async function markPaymentAsPaid(
  paymentId: string,
): Promise<BillingResult> {
  const profile = await requireRole(["super_admin"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      marked_paid_by: profile.id,
    })
    .eq("id", paymentId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/super-admin/billing");
  return { ok: true };
}

export async function toggleCompanyStatus(
  companyId: string,
  next: "active" | "suspended",
): Promise<BillingResult> {
  await requireRole(["super_admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ status: next })
    .eq("id", companyId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/billing");
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(2, "Nombre obligatorio"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type RequestBranchInput = z.input<typeof schema>;
export type RequestBranchResult =
  | { ok: true }
  | { ok: false; message: string };

export async function requestBranch(
  input: RequestBranchInput,
): Promise<RequestBranchResult> {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("branch_requests").insert({
    company_id: profile.company_id,
    requested_by: profile.id,
    name: parsed.data.name.trim(),
    address: parsed.data.address || null,
    city: parsed.data.city || null,
    phone: parsed.data.phone || null,
    notes: parsed.data.notes || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/company");
  return { ok: true };
}

export async function cancelBranchRequest(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("branch_requests")
    .update({ status: "canceled" })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/company");
  return { ok: true };
}

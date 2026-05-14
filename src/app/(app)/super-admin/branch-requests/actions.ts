"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveBranchRequest(
  requestId: string,
): Promise<{ ok: true; branchId: string } | { ok: false; message: string }> {
  const profile = await requireRole(["super_admin"]);
  const supabase = createAdminClient();

  const { data: request, error: rErr } = await supabase
    .from("branch_requests")
    .select(
      "id, company_id, name, address, city, phone, status, created_branch_id",
    )
    .eq("id", requestId)
    .single();
  if (rErr || !request) {
    return { ok: false, message: rErr?.message ?? "No se encontró la solicitud" };
  }
  if (request.status !== "pending") {
    return { ok: false, message: "La solicitud ya fue resuelta" };
  }

  const fullAddress = [request.address, request.city]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(", ");

  const { data: branch, error: bErr } = await supabase
    .from("branches")
    .insert({
      company_id: request.company_id,
      name: request.name,
      address: fullAddress || null,
      phone: request.phone,
      status: "active",
    })
    .select("id")
    .single();
  if (bErr || !branch) {
    return { ok: false, message: bErr?.message ?? "No se pudo crear la sucursal" };
  }

  const { error: uErr } = await supabase
    .from("branch_requests")
    .update({
      status: "approved",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      created_branch_id: branch.id,
    })
    .eq("id", requestId);
  if (uErr) {
    return { ok: false, message: uErr.message };
  }

  revalidatePath("/super-admin/branch-requests");
  revalidatePath("/admin/company");
  return { ok: true, branchId: branch.id };
}

export async function rejectBranchRequest(
  requestId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const profile = await requireRole(["super_admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("branch_requests")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_note: reason?.trim() || null,
    })
    .eq("id", requestId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/super-admin/branch-requests");
  revalidatePath("/admin/company");
  return { ok: true };
}

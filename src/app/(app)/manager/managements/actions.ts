"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function toggleAutoAssignment(
  managementId: string,
  next: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(["manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("managements")
    .update({ auto_assignment_enabled: next })
    .eq("id", managementId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/manager/managements");
  return { ok: true };
}

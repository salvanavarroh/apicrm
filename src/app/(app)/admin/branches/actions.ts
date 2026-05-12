"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Nombre obligatorio"),
  address: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type BranchInput = z.input<typeof inputSchema>;
export type BranchResult =
  | { ok: true }
  | { ok: false; message: string };

export async function upsertBranch(input: BranchInput): Promise<BranchResult> {
  const profile = await requireRole(["admin"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = await createClient();
  const payload = {
    company_id: profile.company_id,
    name: parsed.data.name.trim(),
    address: parsed.data.address?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    status: parsed.data.status,
  };

  const { error } = parsed.data.id
    ? await supabase
        .from("branches")
        .update(payload)
        .eq("id", parsed.data.id)
    : await supabase.from("branches").insert(payload);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/branches");
  return { ok: true };
}

export async function toggleBranchStatus(
  id: string,
  next: "active" | "inactive",
): Promise<BranchResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/branches");
  return { ok: true };
}

export async function deleteBranch(id: string): Promise<BranchResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/branches");
  return { ok: true };
}

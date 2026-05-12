"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Nombre obligatorio"),
  branch_ids: z.array(z.string().uuid()).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type ProductTypeInput = z.input<typeof inputSchema>;
export type ProductTypeResult =
  | { ok: true }
  | { ok: false; message: string };

export async function upsertProductType(
  input: ProductTypeInput,
): Promise<ProductTypeResult> {
  const profile = await requireRole(["admin"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos" };
  if (!profile.company_id) {
    return { ok: false, message: "No tenés empresa asignada" };
  }

  const supabase = await createClient();

  let id = parsed.data.id;
  if (id) {
    const { error } = await supabase
      .from("product_types")
      .update({ name: parsed.data.name.trim(), status: parsed.data.status })
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data, error } = await supabase
      .from("product_types")
      .insert({
        company_id: profile.company_id,
        name: parsed.data.name.trim(),
        status: parsed.data.status,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Error creando" };
    }
    id = data.id;
  }

  // Sync M:N con branches: borrar todas y reinsertar.
  await supabase.from("branch_product_types").delete().eq("product_type_id", id);
  if (parsed.data.branch_ids.length > 0) {
    const rows = parsed.data.branch_ids.map((branch_id) => ({
      branch_id,
      product_type_id: id!,
    }));
    const { error } = await supabase.from("branch_product_types").insert(rows);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/product-types");
  return { ok: true };
}

export async function toggleProductTypeStatus(
  id: string,
  next: "active" | "inactive",
): Promise<ProductTypeResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_types")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/product-types");
  return { ok: true };
}

export async function deleteProductType(
  id: string,
): Promise<ProductTypeResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("product_types").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/product-types");
  return { ok: true };
}

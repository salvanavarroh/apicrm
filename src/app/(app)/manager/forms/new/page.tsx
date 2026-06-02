import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { FormBuilder } from "@/components/forms/form-builder";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewFormManagerPage() {
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  // Solo sucursales y tipos dentro de las gerencias del manager.
  const { data: managements } = await supabase
    .from("managements")
    .select(
      `branch:branches!branch_id (id, name),
       product_type:product_types!product_type_id (id, name)`,
    )
    .eq("manager_id", profile.id);

  const branchMap = new Map<string, string>();
  const productTypeMap = new Map<string, string>();
  for (const m of managements ?? []) {
    if (m.branch) branchMap.set(m.branch.id, m.branch.name);
    if (m.product_type)
      productTypeMap.set(m.product_type.id, m.product_type.name);
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("company_id", profile.company_id!)
    .eq("status", "active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/manager/forms"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nuevo formulario
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo podés rutear leads a las combinaciones de sucursal + tipo que
          manejás.
        </p>
      </header>

      <FormBuilder
        mode="create"
        redirectTo="/manager/forms"
        branches={Array.from(branchMap.entries()).map(([id, label]) => ({
          id,
          label,
        }))}
        productTypes={Array.from(productTypeMap.entries()).map(([id, label]) => ({
          id,
          label,
        }))}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, label: c.name }))}
      />
    </div>
  );
}

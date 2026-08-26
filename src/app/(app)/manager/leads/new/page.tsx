import { AlertTriangle, ChevronLeft } from "lucide-react";
import Link from "next/link";

import { LeadForm } from "@/components/leads/lead-form";
import { actingManagerId, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewLeadManagerPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  // Manager solo puede cargar leads dentro de sus gerencias.
  const { data: managements } = await supabase
    .from("managements")
    .select(
      `
        branch_id,
        product_type_id,
        branches:branch_id (id, name),
        product_types:product_type_id (id, name)
      `,
    )
    .eq("manager_id", actingManagerId(profile));

  const branchMap = new Map<string, string>();
  const productTypeMap = new Map<string, string>();
  // Los pares, además de los catálogos: con dos gerencias (A,X) y (B,Y) las
  // listas sueltas dejaban armar (A,Y), que no es gerencia de nadie y la RLS
  // rechaza igual.
  const pairs: { branchId: string; productTypeId: string }[] = [];
  for (const m of managements ?? []) {
    if (m.branches) branchMap.set(m.branches.id, m.branches.name);
    if (m.product_types)
      productTypeMap.set(m.product_types.id, m.product_types.name);
    if (m.branch_id && m.product_type_id) {
      pairs.push({ branchId: m.branch_id, productTypeId: m.product_type_id });
    }
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("company_id", profile.company_id!)
    .eq("status", "active")
    .order("name");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/manager/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a leads
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo lead</h1>
        <p className="text-sm text-muted-foreground">
          Solo podés cargarlo dentro de las gerencias que manejás.
        </p>
      </header>

      {pairs.length === 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Todavía no tenés ninguna gerencia asignada, así que no podés cargar
            leads. Pedile al administrador que te asigne una sucursal y un tipo
            de producto.
          </span>
        </p>
      )}

      <LeadForm
        mode="create"
        redirectTo="/manager/leads"
        managedPairs={pairs}
        branches={Array.from(branchMap.entries()).map(([id, label]) => ({
          id,
          label,
        }))}
        productTypes={Array.from(productTypeMap.entries()).map(
          ([id, label]) => ({ id, label }),
        )}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, label: c.name }))}
      />
    </div>
  );
}

import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { FormBuilder } from "@/components/forms/form-builder";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewFormAdminPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [branches, productTypes, campaigns] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("product_types")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/forms"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver a formularios
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nuevo formulario
        </h1>
        <p className="text-sm text-muted-foreground">
          Elegí dónde se rutean los leads, qué campos pedir y cómo se ve la
          landing. Al guardar te damos los links públicos.
        </p>
      </header>

      <FormBuilder
        mode="create"
        redirectTo="/admin/forms"
        branches={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        productTypes={(productTypes.data ?? []).map((p) => ({
          id: p.id,
          label: p.name,
        }))}
        campaigns={(campaigns.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
      />
    </div>
  );
}

import { ChevronLeft, ExternalLink, Share2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormBuilder } from "@/components/forms/form-builder";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { parseFields } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { FormShareDialog } from "@/app/(app)/admin/forms/share-dialog";

export default async function EditFormManagerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["manager"]);
  const supabase = await createClient();

  const [{ data: form }, { data: managements }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("lead_capture_forms")
        .select("*")
        .eq("id", id)
        .eq("company_id", profile.company_id!)
        .maybeSingle(),
      supabase
        .from("managements")
        .select(
          `branch:branches!branch_id (id, name),
           product_type:product_types!product_type_id (id, name)`,
        )
        .eq("manager_id", profile.id),
      supabase
        .from("campaigns")
        .select("id, name")
        .eq("company_id", profile.company_id!)
        .eq("status", "active")
        .order("name"),
    ]);

  if (!form) notFound();

  const branchMap = new Map<string, string>();
  const productTypeMap = new Map<string, string>();
  for (const m of managements ?? []) {
    if (m.branch) branchMap.set(m.branch.id, m.branch.name);
    if (m.product_type)
      productTypeMap.set(m.product_type.id, m.product_type.name);
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/manager/forms"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
          <p className="text-sm text-muted-foreground">
            slug: <span className="font-mono">{form.slug}</span> · {form.submissions_count}{" "}
            submissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 size-4" /> Abrir landing
            </a>
          </Button>
          <FormShareDialog
            slug={form.slug}
            active={form.status === "active"}
            trigger={
              <Button>
                <Share2 className="mr-2 size-4" /> Compartir
              </Button>
            }
          />
        </div>
      </header>

      <FormBuilder
        mode="edit"
        redirectTo="/manager/forms"
        initial={{
          id: form.id,
          name: form.name,
          branch_id: form.branch_id,
          product_type_id: form.product_type_id,
          campaign_id: form.campaign_id ?? "",
          status: form.status as "active" | "inactive",
          title: form.title,
          subtitle: form.subtitle ?? "",
          submit_label: form.submit_label,
          success_message: form.success_message,
          logo_url: form.logo_url ?? "",
          banner_url: form.banner_url ?? "",
          primary_color: form.primary_color,
          fields: parseFields(form.fields),
        }}
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

import { notFound } from "next/navigation";

import { PublicLanding } from "@/components/forms/public-landing";
import { parseFields } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";

import "@/app/globals.css";

export const dynamic = "force-dynamic";

export default async function PublicFormLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("lead_capture_forms")
    .select(
      `id, slug, status, title, subtitle, submit_label, success_message,
       logo_url, banner_url, primary_color, fields,
       company:companies!company_id (name, phone, address),
       branch:branches!branch_id (name, address, phone)`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!form || form.status !== "active") notFound();

  // Branch tiene prioridad para los datos de contacto (es la sucursal específica
  // a la que va el lead). Si la sucursal no tiene un campo, falla a company.
  const branchName = form.branch?.name ?? null;
  const address = form.branch?.address ?? form.company?.address ?? null;
  const phone = form.branch?.phone ?? form.company?.phone ?? null;

  return (
    <PublicLanding
      slug={form.slug}
      title={form.title}
      subtitle={form.subtitle}
      submitLabel={form.submit_label}
      successMessage={form.success_message}
      primaryColor={form.primary_color}
      fields={parseFields(form.fields)}
      logoUrl={form.logo_url}
      bannerUrl={form.banner_url}
      companyName={form.company?.name ?? null}
      branchName={branchName}
      address={address}
      phone={phone}
    />
  );
}

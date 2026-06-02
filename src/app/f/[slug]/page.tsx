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
       company:companies!company_id (name)`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!form || form.status !== "active") notFound();

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
    />
  );
}

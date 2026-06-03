import { notFound } from "next/navigation";

import { PublicForm } from "@/components/forms/public-form";
import { parseFields } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";

import "@/app/globals.css";

export const dynamic = "force-dynamic";

export default async function PublicFormEmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("lead_capture_forms")
    .select(
      "slug, status, title, subtitle, submit_label, success_message, primary_color, fields",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!form || form.status !== "active") notFound();

  // Embed: fondo transparente para que se adapte al sitio host (claro u oscuro).
  // La PublicForm card tiene su propio bg blanco + shadow para destacar.
  return (
    <div className="min-h-screen bg-transparent p-3 sm:p-4">
      <div className="mx-auto max-w-xl">
        <PublicForm
          slug={form.slug}
          title={form.title}
          subtitle={form.subtitle}
          submitLabel={form.submit_label}
          successMessage={form.success_message}
          primaryColor={form.primary_color}
          fields={parseFields(form.fields)}
        />
      </div>
    </div>
  );
}

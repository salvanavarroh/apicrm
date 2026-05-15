import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { QuoteBuilder } from "./quote-builder";

export default async function NewQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const [{ data: lead }, { data: prices }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
          id,
          first_name,
          last_name,
          email,
          phone,
          vehicle_model,
          vehicle_version,
          preferred_color,
          product_type_id
        `,
      )
      .eq("id", id)
      .eq("assigned_user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("prices")
      .select("id, brand, model, version, model_year, list_price")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("brand")
      .order("model"),
  ]);

  if (!lead) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/sales/leads/${id}`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver al lead
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Generar presupuesto
        </h1>
        <p className="text-sm text-muted-foreground">
          Vista previa o generación. El estado del lead pasa a Presupuestado al
          generar.
        </p>
      </header>

      <QuoteBuilder
        leadId={lead.id}
        initial={{
          client_first_name: lead.first_name ?? "",
          client_last_name: lead.last_name ?? "",
          client_email: lead.email ?? "",
          client_phone: lead.phone ?? "",
          vehicle_model: lead.vehicle_model ?? "",
          vehicle_version: lead.vehicle_version ?? "",
          vehicle_color: lead.preferred_color ?? "",
        }}
        prices={(prices ?? []).map((p) => ({
          id: p.id,
          label: `${p.brand} ${p.model}${p.version ? " " + p.version : ""}${p.model_year ? " " + p.model_year : ""}`,
          price: Number(p.list_price),
        }))}
      />
    </div>
  );
}

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadForm } from "@/components/leads/lead-form";
import { LeadBusinessCard } from "@/components/leads/ficha-blocks";
import { EditContactDialog } from "@/components/leads/edit-contact-dialog";
import { LeadIdentityHeader } from "@/components/leads/lead-identity-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProviderLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["data_provider"]);
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("created_by", profile.id)
    .maybeSingle();

  if (!lead) notFound();

  const editable = lead.status === "new";

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/data-provider/leads"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <LeadIdentityHeader
        firstName={lead.first_name}
        lastName={lead.last_name}
        status={lead.status}
        temperature={lead.temperature}
        createdAt={lead.created_at}
        statusChangedAt={lead.status_changed_at}
        lastContactedAt={lead.last_contacted_at}
        phone={lead.phone}
        email={lead.email}
        contactEditor={
          <EditContactDialog
            leadId={lead.id}
            phone={lead.phone}
            email={lead.email}
          />
        }
        city={lead.city}
        vehicle={
          [lead.vehicle_model, lead.vehicle_version].filter(Boolean).join(" ") ||
          null
        }
      />

      {!editable && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          Este lead ya fue tomado por un vendedor — no podés editarlo.
        </div>
      )}

      {editable ? (
        <LeadForm
          mode="edit"
          redirectTo="/data-provider/leads"
          initial={{
            id: lead.id,
            first_name: lead.first_name ?? "",
            last_name: lead.last_name ?? "",
            email: lead.email ?? "",
            phone: lead.phone ?? "",
            city: lead.city ?? "",
            vehicle_model: lead.vehicle_model ?? "",
            vehicle_version: lead.vehicle_version ?? "",
            preferred_color: lead.preferred_color ?? "",
            budget_min: lead.budget_min ? String(lead.budget_min) : "",
            budget_max: lead.budget_max ? String(lead.budget_max) : "",
            has_used_car: lead.has_used_car,
            used_car_description: lead.used_car_description ?? "",
            declared_payment_method: lead.declared_payment_method ?? "",
            campaign_id: lead.campaign_id ?? "",
            branch_id: lead.branch_id ?? "",
            product_type_id: lead.product_type_id ?? "",
            initial_notes: lead.initial_notes ?? "",
          }}
          branches={(branches.data ?? []).map((b) => ({
            id: b.id,
            label: b.name,
          }))}
          productTypes={(productTypes.data ?? []).map((p) => ({
            id: p.id,
            label: p.name,
          }))}
          campaigns={(campaigns.data ?? []).map((c) => ({
            id: c.id,
            label: c.name,
          }))}
        />
      ) : (
        <LeadBusinessCard
          lead={{
            vehicle_model: lead.vehicle_model,
            vehicle_version: lead.vehicle_version,
            preferred_color: lead.preferred_color,
            budget_min: lead.budget_min,
            budget_max: lead.budget_max,
            declared_payment_method: lead.declared_payment_method,
            has_used_car: lead.has_used_car,
            used_car_description: lead.used_car_description,
            initial_notes: lead.initial_notes,
          }}
        />
      )}
    </div>
  );
}

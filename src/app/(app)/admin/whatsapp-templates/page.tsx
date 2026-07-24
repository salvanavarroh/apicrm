import { requireRole } from "@/lib/auth";
import {
  TemplatesManager,
  type WaChannel,
  type WaTemplate,
} from "@/components/messaging/templates-manager";
import { createClient } from "@/lib/supabase/server";

export default async function WhatsappTemplatesPage() {
  const profile = await requireRole(["admin", "manager"]);
  const supabase = await createClient();

  const [{ data: channels }, { data: templates }] = await Promise.all([
    supabase
      .from("messaging_channels")
      .select("id, display_name, external_ref")
      .eq("company_id", profile.company_id!)
      .eq("platform", "whatsapp")
      .eq("status", "active"),
    supabase
      .from("whatsapp_templates")
      .select(
        "id, zernio_template_name, language, category, status, is_standard, body_preview, rejection_reason",
      )
      .eq("company_id", profile.company_id!)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Plantillas de WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Plantillas aprobadas por Meta para reabrir conversaciones fuera de la
          ventana de 24h. Creá el set estándar o las tuyas; Meta las revisa en
          ~1-2 días.
        </p>
      </header>
      <TemplatesManager
        channels={(channels ?? []) as WaChannel[]}
        templates={(templates ?? []) as WaTemplate[]}
      />
    </div>
  );
}

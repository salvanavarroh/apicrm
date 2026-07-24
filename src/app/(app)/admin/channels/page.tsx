import { requireRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChannelRowActions,
  ConnectButtons,
} from "@/components/channels/channel-controls";
import { createClient } from "@/lib/supabase/server";

const PLATFORM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  connecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

export default async function AdminChannelsPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("messaging_channels")
    .select(
      "id, platform, external_ref, display_name, status, quality_rating, messaging_limit_tier, name_status, connected_at",
    )
    .eq("company_id", profile.company_id!)
    .order("created_at", { ascending: false });

  const rows = channels ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Canales</h1>
        <p className="text-sm text-muted-foreground">
          Conectá el WhatsApp y las redes de la concesionaria. Los mensajes entran
          al inbox y los Lead Ads de Meta se cargan solos como leads.
        </p>
      </header>

      <Card className="p-4">
        <ConnectButtons />
        <p className="mt-3 text-xs text-muted-foreground">
          WhatsApp usa el Embedded Signup de Meta (podés conectar tu número
          existente con coexistencia). El nombre puede tardar 1-3 días en
          aprobarse; hasta entonces no se pueden enviar mensajes.
        </p>
      </Card>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay canales conectados todavía.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {PLATFORM_LABEL[c.platform] ?? c.platform}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {c.display_name ?? c.external_ref ?? ""}
                  </span>
                  <Badge className={STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
                </div>
                {c.platform === "whatsapp" && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {c.quality_rating && <span>calidad: {c.quality_rating}</span>}
                    {c.messaging_limit_tier && <span>tier: {c.messaging_limit_tier}</span>}
                    {c.name_status && c.name_status !== "APPROVED" && (
                      <span className="text-amber-600">nombre: {c.name_status}</span>
                    )}
                  </div>
                )}
              </div>
              <ChannelRowActions channelId={c.id} platform={c.platform} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

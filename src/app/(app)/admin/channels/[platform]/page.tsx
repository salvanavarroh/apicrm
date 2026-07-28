import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChannelRowActions,
  PlatformConnect,
} from "@/components/channels/channel-controls";
import { createClient } from "@/lib/supabase/server";

type Platform = "whatsapp" | "instagram" | "facebook";

const META: Record<Platform, { title: string; desc: string }> = {
  whatsapp: {
    title: "WhatsApp",
    desc: "Conectá el WhatsApp de la concesionaria (coexistencia: seguís usando la app en el celular) o comprá un número nuevo. Los mensajes entran al inbox.",
  },
  instagram: {
    title: "Instagram",
    desc: "Conectá la cuenta de Instagram. Los DMs entran al inbox como leads.",
  },
  facebook: {
    title: "Facebook",
    desc: "Conectá la Página de Facebook. Habilita los Lead Ads de Meta y los DMs de Messenger entran al inbox.",
  },
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  connecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

export default async function ChannelPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  if (!["whatsapp", "instagram", "facebook"].includes(platform)) notFound();
  const p = platform as Platform;

  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("messaging_channels")
    .select(
      "id, platform, external_ref, display_name, status, quality_rating, messaging_limit_tier, name_status, connected_at",
    )
    .eq("company_id", profile.company_id!)
    .eq("platform", p)
    .order("created_at", { ascending: false });

  const rows = channels ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Conexión · {META[p].title}
        </h1>
        <p className="text-sm text-muted-foreground">{META[p].desc}</p>
      </header>

      <Card className="p-4">
        <PlatformConnect platform={p} />
        {p === "whatsapp" && (
          <p className="mt-3 text-xs text-muted-foreground">
            El nombre para mostrar puede tardar 1-3 días en aprobarse en Meta;
            hasta entonces no se pueden enviar mensajes.
          </p>
        )}
      </Card>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay {META[p].title} conectado todavía.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {c.display_name ?? c.external_ref ?? META[p].title}
                  </span>
                  <Badge className={STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
                </div>
                {p === "whatsapp" && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {c.quality_rating && <span>calidad: {c.quality_rating}</span>}
                    {c.messaging_limit_tier && <span>tier: {c.messaging_limit_tier}</span>}
                    {c.name_status && c.name_status !== "APPROVED" && (
                      <span className="text-amber-600">nombre: {c.name_status}</span>
                    )}
                  </div>
                )}
              </div>
              <ChannelRowActions
                channelId={c.id}
                platform={c.platform}
                status={c.status}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

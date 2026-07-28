"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BrandIcon, PLATFORM_META } from "@/components/integrations/brand-icon";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  disconnectChannel,
  refreshChannelHealth,
  startBuyNumber,
  startConnect,
  syncChannels,
} from "@/app/(app)/admin/channels/actions";

export type Channel = {
  id: string;
  platform: string;
  display_name: string | null;
  external_ref: string | null;
  status: string;
  photo_url: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  name_status: string | null;
};

const ORDER = ["whatsapp", "instagram", "facebook", "metaads"] as const;
// Meta Ads se conecta con el flujo de Facebook (trae ads).
const CONNECT_AS: Record<string, "whatsapp" | "instagram" | "facebook"> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  metaads: "facebook",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  connecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

export function ConnectionsGrid({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kyc, setKyc] = useState<string | null>(null);

  function connect(platform: string) {
    start(async () => {
      const res = await startConnect(CONNECT_AS[platform]);
      if (res.ok) window.location.href = res.authUrl;
      else toast.error(res.message);
    });
  }
  function buy() {
    if (
      !confirm(
        "Vas a provisionar un número nuevo de WhatsApp vía Zernio (~$8/mes en Argentina, con verificación KYC de 1-3 días). ¿Continuar?",
      )
    )
      return;
    start(async () => {
      const res = await startBuyNumber();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.kycUrl) {
        setKyc(res.kycUrl);
        toast.success("Completá la verificación KYC para activar el número");
      } else toast.success("Número solicitado");
    });
  }
  function sync() {
    start(async () => {
      const res = await syncChannels();
      if (res.ok) {
        toast.success(`Sincronizado (${res.synced} cuentas)`);
        router.refresh();
      } else toast.error(res.message);
    });
  }
  function health(id: string) {
    start(async () => {
      const res = await refreshChannelHealth(id);
      if (res.ok) {
        toast.success("Salud actualizada");
        router.refresh();
      } else toast.error(res.message);
    });
  }
  function disconnect(id: string) {
    if (
      !confirm(
        "¿Desconectar? Deja de recibir mensajes y de facturar esta cuenta en Zernio. Podés reconectarla después.",
      )
    )
      return;
    start(async () => {
      const res = await disconnectChannel(id);
      if (res.ok) {
        toast.success("Desconectado");
        router.refresh();
      } else toast.error(res.message);
    });
  }
  function reconnect(platform: string) {
    connect(platform);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Conectá las redes de la concesionaria. Los mensajes entran al Inbox.
        </p>
        <Button size="sm" variant="outline" onClick={sync} disabled={pending}>
          <RefreshCw className="mr-1 size-4" /> Sincronizar
        </Button>
      </div>

      {kyc && (
        <a href={kyc} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">
          Abrir verificación KYC del número →
        </a>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {ORDER.map((platform) => {
          const meta = PLATFORM_META[platform];
          const accounts = channels.filter((c) => c.platform === platform);
          return (
            <Card key={platform} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className={cn("flex size-11 items-center justify-center rounded-xl", meta.tint)}>
                  <BrandIcon platform={platform} className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.desc}</div>
                </div>
              </div>

              {/* Cuentas conectadas */}
              {accounts.length > 0 && (
                <div className="space-y-2">
                  {accounts.map((c) => {
                    const canReconnect =
                      c.status === "disconnected" || c.status === "error";
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-lg border p-2"
                      >
                        <ContactAvatar
                          name={c.display_name ?? c.external_ref}
                          photoUrl={c.photo_url}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {c.display_name ?? c.external_ref ?? meta.label}
                            </span>
                            <Badge className={cn("text-[10px]", STATUS_TONE[c.status])}>
                              {c.status}
                            </Badge>
                          </div>
                          {platform === "whatsapp" && (
                            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                              {c.quality_rating && <span>calidad: {c.quality_rating}</span>}
                              {c.messaging_limit_tier && <span>{c.messaging_limit_tier}</span>}
                              {c.name_status && c.name_status !== "APPROVED" && (
                                <span className="text-amber-600">nombre: {c.name_status}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {canReconnect ? (
                            <Button size="sm" onClick={() => reconnect(platform)} disabled={pending}>
                              Reconectar
                            </Button>
                          ) : (
                            <>
                              {platform === "whatsapp" && (
                                <Button size="sm" variant="ghost" onClick={() => health(c.id)} disabled={pending}>
                                  Salud
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => disconnect(c.id)} disabled={pending}>
                                Desconectar
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Acciones de conexión */}
              <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" onClick={() => connect(platform)} disabled={pending}>
                  {accounts.length > 0 ? "Conectar otra" : `Conectar ${meta.label}`}
                </Button>
                {platform === "whatsapp" && (
                  <Button size="sm" variant="outline" onClick={buy} disabled={pending}>
                    Comprar número
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

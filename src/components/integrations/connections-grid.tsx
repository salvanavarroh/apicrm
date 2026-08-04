"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BrandIcon, PLATFORM_META } from "@/components/integrations/brand-icon";
import {
  explainBlocker,
  explainNameStatus,
  type HealthExplanation,
} from "@/lib/messaging/whatsapp-health";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  disconnectChannel,
  refreshChannelHealth,
  setChannelRouting,
  startBuyNumber,
  startConnect,
  startConnectMetaAds,
  syncChannels,
} from "@/app/(app)/admin/channels/actions";

export type NumberHealth = {
  status?: string | null;
  canSendMessage?: string | null;
  businessVerification?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  isOfficial?: boolean | null;
  blockers?: { entity: string; code?: number; description: string; solution?: string }[];
};
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
  metadata: { health?: NumberHealth } | null;
  branch_id: string | null;
  product_type_id: string | null;
  campaign_id: string | null;
};

export type RoutingOption = { id: string; name: string };

// Canales cuyos leads heredan el routing del canal (mensajería directa). Meta Ads
// usa el mapeo por formulario (lead_ad_forms), no este.
const MESSAGING_PLATFORMS = new Set(["whatsapp", "instagram", "facebook"]);

const ORDER = [
  "whatsapp",
  "instagram",
  "facebook",
  "metaads",
  "tiktok",
  "google",
] as const;
// Cada card → el slug del flujo de conexión de Zernio. Meta Ads va con Facebook
// (trae los ads); TikTok/Google Ads usan sus flujos de ads (OAuth real).
const CONNECT_AS: Record<
  string,
  "whatsapp" | "instagram" | "facebook" | "tiktok-ads" | "google-ads"
> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  metaads: "facebook",
  tiktok: "tiktok-ads",
  google: "google-ads",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  connecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  connecting: "Conectando",
  disconnected: "Desconectado",
  error: "Error",
};

// Salud del número de WhatsApp: estado de envío + bloqueos accionables (método
// de pago, verificación del negocio, nombre sin aprobar).
function WhatsappHealth({
  health,
  nameStatus,
}: {
  health?: NumberHealth;
  nameStatus: string | null;
}) {
  const nameExp = nameStatus ? explainNameStatus(nameStatus) : null;
  const csm = health?.canSendMessage ?? undefined;
  if (!health && !nameExp) return null;

  const tone =
    csm === "BLOCKED"
      ? "text-red-600"
      : csm === "LIMITED"
        ? "text-amber-600"
        : "text-emerald-600";
  const label =
    csm === "BLOCKED"
      ? "Envío bloqueado"
      : csm === "LIMITED"
        ? "Envío limitado"
        : csm === "AVAILABLE"
          ? "Puede enviar mensajes"
          : null;

  const issues: HealthExplanation[] = [
    ...(nameExp ? [nameExp] : []),
    ...(health?.blockers ?? []).map((b) => explainBlocker(b.code, b.description, b.solution)),
  ];
  const clean = issues.length === 0 && csm === "AVAILABLE";

  return (
    <div className="mt-2 space-y-2 border-t pt-2 text-[11px]">
      {label && (
        <div className={cn("flex items-center gap-1.5 font-medium", tone)}>
          {csm === "AVAILABLE" ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
          {label}
        </div>
      )}
      {clean && (
        <div className="text-muted-foreground">Sin restricciones. Todo en orden.</div>
      )}
      {issues.map((x, i) => (
        <div key={i} className="rounded-md bg-background/60 p-2">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <span className="text-foreground">{x.title}</span>
          </div>
          <div className="mt-1 pl-5 text-muted-foreground">
            <span className="font-medium text-foreground">Qué hacer: </span>
            {x.whatToDo}
          </div>
          {x.url && (
            <a
              href={x.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 ml-5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {x.urlLabel ?? "Resolver"}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function ConnectionsGrid({
  channels,
  branches,
  productTypes,
  campaigns,
}: {
  channels: Channel[];
  branches: RoutingOption[];
  productTypes: RoutingOption[];
  campaigns: RoutingOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kyc, setKyc] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);

  // Abre el OAuth de Zernio en una pestaña NUEVA (no saca al usuario del CRM) y
  // ofrece "Ya conecté" para actualizar al volver. La pestaña se pre-abre en el
  // mismo clic para que el navegador no la bloquee como popup.
  function connectedDialog(label: string) {
    setConfirmState({
      title: `Conectando ${label} en Zernio`,
      description: `Se abrió Zernio en otra pestaña para autorizar ${label}. Cuando termines allá, volvé acá y tocá "Ya conecté" para actualizar la cuenta.`,
      confirmLabel: "Ya conecté",
      onConfirm: () => sync(),
    });
  }
  function openInTab(win: Window | null, url: string) {
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
  function connect(platform: string) {
    const label = PLATFORM_META[platform]?.label ?? platform;
    const win = window.open("about:blank", "_blank");
    start(async () => {
      const res = await startConnect(CONNECT_AS[platform]);
      if (!res.ok) {
        win?.close();
        toast.error(res.message);
        return;
      }
      // Zernio a veces responde sin authUrl (la cuenta ya estaba vinculada) →
      // no abrimos OAuth, solo sincronizamos.
      if (!res.authUrl) {
        win?.close();
        toast.success("La cuenta ya estaba vinculada — sincronizando");
        sync();
        return;
      }
      openInTab(win, res.authUrl);
      connectedDialog(label);
    });
  }
  // Meta Ads: /connect/facebook/ads. Si ya estaba conectado, lo activa sin OAuth;
  // si no, abre el OAuth (con scopes de ads) en pestaña nueva.
  function connectMetaAds() {
    const win = window.open("about:blank", "_blank");
    start(async () => {
      const res = await startConnectMetaAds();
      if (!res.ok) {
        win?.close();
        toast.error(res.message);
        return;
      }
      if (res.alreadyConnected) {
        win?.close();
        toast.success("Meta Ads ya estaba conectado — activado");
        router.refresh();
        return;
      }
      if (res.authUrl) {
        openInTab(win, res.authUrl);
        connectedDialog("Meta Ads");
      } else {
        win?.close();
      }
    });
  }
  function startConnectFor(platform: string) {
    if (platform === "metaads") connectMetaAds();
    else connect(platform);
  }
  function buy() {
    setConfirmState({
      title: "Comprar número de WhatsApp",
      description:
        "Vas a provisionar un número nuevo vía Zernio (~$9/mes en Argentina, con verificación KYC de 1 a 3 días).",
      confirmLabel: "Comprar número",
      onConfirm: () =>
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
        }),
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
    setConfirmState({
      title: "Desconectar canal",
      description:
        "Vas a dejar de recibir mensajes y de facturar esta cuenta en Zernio. Podés reconectarla después.",
      confirmLabel: "Desconectar",
      danger: true,
      onConfirm: () =>
        start(async () => {
          const res = await disconnectChannel(id);
          if (res.ok) {
            toast.success("Desconectado");
            router.refresh();
          } else toast.error(res.message);
        }),
    });
  }
  function reconnect(platform: string) {
    startConnectFor(platform);
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
                        className="rounded-lg bg-muted/40 p-2"
                      >
                        <div className="flex items-center gap-2.5">
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
                              <Badge className={cn("shrink-0 text-[10px]", STATUS_TONE[c.status])}>
                                {STATUS_LABEL[c.status] ?? c.status}
                              </Badge>
                            </div>
                            {platform === "whatsapp" && (
                              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                                {c.quality_rating && <span>calidad: {c.quality_rating}</span>}
                                {c.messaging_limit_tier && <span>{c.messaging_limit_tier}</span>}
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
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => health(c.id)}
                                    disabled={pending}
                                    title="Actualizar estado y salud del número"
                                  >
                                    <RefreshCw className={cn("mr-1 size-4", pending && "animate-spin")} />
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
                        {platform === "whatsapp" && (
                          <WhatsappHealth health={c.metadata?.health} nameStatus={c.name_status} />
                        )}
                        {MESSAGING_PLATFORMS.has(platform) && c.status === "active" && (
                          <ChannelRouting
                            channel={c}
                            branches={branches}
                            productTypes={productTypes}
                            campaigns={campaigns}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Acciones de conexión */}
              <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" onClick={() => startConnectFor(platform)} disabled={pending}>
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

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}

// Routing por defecto del canal (número). Los leads que entran por acá heredan
// sucursal + tipo + campaña. Auto-guarda al cambiar cualquier selector.
function ChannelRouting({
  channel,
  branches,
  productTypes,
  campaigns,
}: {
  channel: Channel;
  branches: RoutingOption[];
  productTypes: RoutingOption[];
  campaigns: RoutingOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState(channel.branch_id ?? "");
  const [productTypeId, setProductTypeId] = useState(channel.product_type_id ?? "");
  const [campaignId, setCampaignId] = useState(channel.campaign_id ?? "");

  function save(next: { b?: string; p?: string; c?: string }) {
    const payload = {
      branchId: (next.b ?? branchId) || null,
      productTypeId: (next.p ?? productTypeId) || null,
      campaignId: (next.c ?? campaignId) || null,
    };
    start(async () => {
      const res = await setChannelRouting(channel.id, payload);
      if (res.ok) {
        toast.success("Routing guardado");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  const selectCls =
    "min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-[11px] disabled:opacity-60";

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        Enrutar leads de este número a:
      </p>
      <div className="flex flex-wrap gap-1.5">
        <select
          value={branchId}
          disabled={pending}
          onChange={(e) => {
            setBranchId(e.target.value);
            save({ b: e.target.value });
          }}
          className={selectCls}
          title="Sucursal"
        >
          <option value="">Sucursal…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={productTypeId}
          disabled={pending}
          onChange={(e) => {
            setProductTypeId(e.target.value);
            save({ p: e.target.value });
          }}
          className={selectCls}
          title="Tipo de producto (opcional)"
        >
          <option value="">Tipo (se clasifica luego)</option>
          {productTypes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={campaignId}
          disabled={pending}
          onChange={(e) => {
            setCampaignId(e.target.value);
            save({ c: e.target.value });
          }}
          className={selectCls}
          title="Campaña (opcional)"
        >
          <option value="">Campaña…</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

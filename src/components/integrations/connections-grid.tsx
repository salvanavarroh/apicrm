"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { BrandIcon, PLATFORM_META } from "@/components/integrations/brand-icon";
import {
  explainBlocker,
  explainNameStatus,
  type HealthExplanation,
} from "@/lib/messaging/whatsapp-health";
import { Button } from "@/components/ui/button";
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

// Grupos del panel: mensajería (entra al Inbox) vs. publicidad (métricas/Lead Ads).
const GROUPS = [
  { key: "messaging", label: "Mensajería", platforms: ["whatsapp", "instagram", "facebook"] },
  { key: "ads", label: "Publicidad", platforms: ["metaads", "tiktok", "google"] },
] as const;
const ALL_PLATFORMS = GROUPS.flatMap((g) => g.platforms);

// Cada plataforma → el slug del flujo de conexión de Zernio. Meta Ads va con
// Facebook (trae los ads); TikTok/Google usan sus flujos de ads (OAuth real).
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

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  connecting: "Conectando",
  disconnected: "Desconectado",
  error: "Error",
};

// Estado de cada canal activo cuando no es WhatsApp (que tiene salud aparte).
const STATUS_TEXT: Record<string, string> = {
  instagram: "Recibiendo DMs de Instagram.",
  facebook: "Recibiendo mensajes de Messenger.",
  metaads: "Trayendo métricas de anuncios y formularios de Lead Ads.",
  tiktok: "Trayendo métricas de tus anuncios de TikTok.",
  google: "Trayendo métricas de tus campañas de Google Ads.",
};

type HealthTone = "good" | "warn" | "crit";
// Resuelve la salud del número de WhatsApp: severidad, etiqueta y avisos accionables.
function computeHealth(
  health?: NumberHealth,
  nameStatus?: string | null,
): { tone: HealthTone; label: string; issues: HealthExplanation[] } {
  const nameExp = nameStatus ? explainNameStatus(nameStatus) : null;
  const csm = health?.canSendMessage ?? undefined;
  const issues: HealthExplanation[] = [
    ...(nameExp ? [nameExp] : []),
    ...(health?.blockers ?? []).map((b) => explainBlocker(b.code, b.description, b.solution)),
  ];
  const tone: HealthTone =
    csm === "BLOCKED" ? "crit" : issues.length > 0 || csm === "LIMITED" ? "warn" : "good";
  const label =
    csm === "BLOCKED"
      ? "Envío bloqueado"
      : csm === "LIMITED"
        ? "Envío limitado"
        : csm === "AVAILABLE"
          ? "Puede enviar mensajes"
          : issues.length
            ? "Con avisos"
            : "Sin restricciones";
  return { tone, label, issues };
}

const HEALTH_CLS: Record<HealthTone, { text: string; dot: string }> = {
  good: { text: "text-emerald-600", dot: "bg-emerald-500" },
  warn: { text: "text-amber-600", dot: "bg-amber-500" },
  crit: { text: "text-red-600", dot: "bg-red-500" },
};

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/50")} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function HealthChip({ tone, count }: { tone: HealthTone; count: number }) {
  const c = HEALTH_CLS[tone];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold", c.text)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {count > 0 ? `${count} aviso${count === 1 ? "" : "s"}` : "Ok"}
    </span>
  );
}

// Íconos de marca en cuadrado con tinte de la plataforma.
function ChannelIcon({ platform, size = "md" }: { platform: string; size?: "sm" | "md" }) {
  const meta = PLATFORM_META[platform];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        meta.tint,
        size === "md" ? "size-9" : "size-7",
      )}
    >
      <BrandIcon platform={platform} className={size === "md" ? "size-5" : "size-4"} />
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

  function routeSummary(c: Channel): { text: string; unset: boolean } {
    const b = branches.find((x) => x.id === c.branch_id)?.name;
    const p = productTypes.find((x) => x.id === c.product_type_id)?.name;
    if (!b) return { text: "Sin sucursal — cae al pool", unset: true };
    return { text: [b, p].filter(Boolean).join(" · "), unset: false };
  }

  // ---- resumen ----
  const activeChannels = channels.filter((c) => c.status === "active");
  const warnCount = channels.filter(
    (c) => c.platform === "whatsapp" && computeHealth(c.metadata?.health, c.name_status).issues.length > 0,
  ).length;
  const notConnected = ALL_PLATFORMS.filter(
    (p) => !channels.some((c) => c.platform === p && c.status === "active"),
  ).length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3 shadow-sm">
        <Stat n={activeChannels.length} label="conectados" />
        <div className="border-l pl-4">
          <Stat n={warnCount} label="con avisos" tone={warnCount ? "warn" : undefined} />
        </div>
        <div className="border-l pl-4">
          <Stat n={notConnected} label="sin conectar" />
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={sync} disabled={pending}>
          <RefreshCw className={cn("mr-1 size-4", pending && "animate-spin")} /> Sincronizar
        </Button>
      </div>

      {kyc && (
        <a href={kyc} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">
          Abrir verificación KYC del número →
        </a>
      )}

      {/* Grupos */}
      {GROUPS.map((g) => {
        const rows = g.platforms.flatMap((platform) => {
          const accounts = channels.filter((c) => c.platform === platform);
          if (accounts.length === 0) return [{ platform, channel: null as Channel | null }];
          return accounts.map((channel) => ({ platform, channel }));
        });
        const connectedInGroup = g.platforms.filter((p) =>
          channels.some((c) => c.platform === p && c.status === "active"),
        ).length;

        return (
          <section key={g.key}>
            <div className="mb-2 mt-4 flex items-center gap-2.5 px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
                {g.label}
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                {connectedInGroup} conectado{connectedInGroup === 1 ? "" : "s"}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              {rows.map(({ platform, channel }) => {
                const meta = PLATFORM_META[platform];
                // Sin cuenta → fila "sin conectar".
                if (!channel) {
                  return (
                    <div
                      key={platform}
                      className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
                    >
                      <ChannelIcon platform={platform} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{meta.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{meta.desc}</div>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                        <span className="size-1.5 rounded-full bg-muted-foreground/40" /> Sin conectar
                      </span>
                      <Button size="sm" onClick={() => startConnectFor(platform)} disabled={pending}>
                        Conectar
                      </Button>
                    </div>
                  );
                }

                const c = channel;
                const isMessaging = MESSAGING_PLATFORMS.has(platform);
                const isWa = platform === "whatsapp";
                const canReconnect = c.status === "disconnected" || c.status === "error";

                // Cuenta desconectada/con error → fila compacta con reconectar/quitar.
                if (canReconnect) {
                  return (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
                    >
                      <ChannelIcon platform={platform} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {c.display_name ?? c.external_ref ?? meta.label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{meta.label}</div>
                      </div>
                      <StatusPill status={c.status} />
                      <Button size="sm" onClick={() => reconnect(platform)} disabled={pending}>
                        Reconectar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => disconnect(c.id)} disabled={pending}>
                        Quitar
                      </Button>
                    </div>
                  );
                }

                const h = isWa ? computeHealth(c.metadata?.health, c.name_status) : null;
                const route = isMessaging ? routeSummary(c) : null;

                return (
                  <details
                    key={c.id}
                    className="group overflow-hidden rounded-xl border bg-card shadow-sm open:border-border/90"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                      <ChannelIcon platform={platform} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {c.display_name ?? c.external_ref ?? meta.label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {meta.label}
                          {isWa && c.messaging_limit_tier ? ` · ${c.messaging_limit_tier}` : ""}
                        </div>
                      </div>
                      <StatusPill status={c.status} />
                      {route && (
                        <span
                          className={cn(
                            "hidden max-w-[190px] items-center gap-1.5 text-xs md:flex",
                            route.unset ? "text-muted-foreground/70 italic" : "text-muted-foreground",
                          )}
                        >
                          <RefreshCw className="size-3.5 shrink-0 rotate-90 text-muted-foreground/50" />
                          <span className="truncate">{route.text}</span>
                        </span>
                      )}
                      {h ? (
                        <HealthChip tone={h.tone} count={h.issues.length} />
                      ) : (
                        <HealthChip tone="good" count={0} />
                      )}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>

                    <div className="grid grid-cols-1 gap-3 border-t bg-muted/30 p-3 sm:grid-cols-2">
                      {/* Salud (WhatsApp) o estado */}
                      <div className="rounded-lg border bg-card p-3">
                        <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                          {isWa ? "Salud del número" : "Estado"}
                          {h && h.tone !== "good" && (
                            <span className={cn("normal-case tracking-normal", HEALTH_CLS[h.tone].text)}>
                              {h.label}
                            </span>
                          )}
                        </p>
                        {isWa && h && h.issues.length > 0 ? (
                          <div className="space-y-2">
                            {h.issues.map((x, i) => (
                              <div key={i} className="rounded-md border p-2 text-[12px]">
                                <div className="flex items-start gap-1.5">
                                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                                  <span className="font-medium">{x.title}</span>
                                </div>
                                <div className="mt-1 pl-5 text-muted-foreground">
                                  <span className="font-semibold text-foreground">Qué hacer: </span>
                                  {x.whatToDo}
                                </div>
                                {x.url && (
                                  <a
                                    href={x.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1.5 ml-5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                  >
                                    <ExternalLink className="size-3" />
                                    {x.urlLabel ?? "Resolver"}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-600">
                            <CheckCircle2 className="size-4 shrink-0" />
                            {isWa ? "Sin restricciones. Todo en orden." : STATUS_TEXT[platform] ?? "Conectado."}
                          </div>
                        )}
                        {isWa && (c.quality_rating || c.messaging_limit_tier) && (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                            {c.quality_rating && <span>Calidad: {c.quality_rating}</span>}
                            {c.messaging_limit_tier && <span>Límite: {c.messaging_limit_tier}</span>}
                          </div>
                        )}
                      </div>

                      {/* Routing (mensajería) */}
                      {isMessaging ? (
                        <div className="rounded-lg border bg-card p-3">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                            Enrutar leads de este número
                          </p>
                          <ChannelRouting
                            channel={c}
                            branches={branches}
                            productTypes={productTypes}
                            campaigns={campaigns}
                          />
                        </div>
                      ) : (
                        <div className="rounded-lg border bg-card p-3">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                            Routing
                          </p>
                          <p className="text-[12px] text-muted-foreground">
                            Cada formulario de Lead Ads se mapea a su sucursal/campaña desde la
                            pestaña <span className="font-semibold text-foreground">Lead Ads</span>.
                          </p>
                        </div>
                      )}

                      {/* Acciones */}
                      <div className="col-span-full flex flex-wrap items-center gap-2 pt-0.5">
                        {isWa && (
                          <Button size="sm" variant="outline" onClick={() => health(c.id)} disabled={pending}>
                            <RefreshCw className={cn("mr-1 size-4", pending && "animate-spin")} />
                            Actualizar salud
                          </Button>
                        )}
                        <span className="flex-1" />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => disconnect(c.id)}
                          disabled={pending}
                        >
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Conectar un canal nuevo */}
      <div className="mt-4 rounded-xl border border-dashed bg-card p-4">
        <p className="text-sm font-semibold">
          Conectar un canal nuevo{" "}
          <span className="font-normal text-muted-foreground">
            · los mensajes entran al Inbox y los anuncios al panel de Ads
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => startConnectFor(p)}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border py-1.5 pl-1.5 pr-3 text-[12.5px] font-medium transition-colors hover:border-border/80 hover:bg-muted/50 disabled:opacity-60"
            >
              <ChannelIcon platform={p} size="sm" />
              {PLATFORM_META[p].label}
              <Plus className="size-3.5 text-muted-foreground" />
            </button>
          ))}
          <button
            type="button"
            onClick={buy}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
          >
            Comprar número de WhatsApp
            <span className="text-muted-foreground">→</span>
          </button>
        </div>
      </div>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <b
        className={cn(
          "text-lg font-bold tabular-nums leading-none tracking-tight",
          tone === "warn" && n > 0 && "text-amber-600",
        )}
      >
        {n}
      </b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
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
    "w-full rounded-md border bg-background px-2.5 py-1.5 text-[13px] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="flex flex-col gap-2">
      <Field label="Sucursal">
        <select
          value={branchId}
          disabled={pending}
          onChange={(e) => {
            setBranchId(e.target.value);
            save({ b: e.target.value });
          }}
          className={selectCls}
        >
          <option value="">Sin asignar — pool general</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tipo de producto · opcional">
        <select
          value={productTypeId}
          disabled={pending}
          onChange={(e) => {
            setProductTypeId(e.target.value);
            save({ p: e.target.value });
          }}
          className={selectCls}
        >
          <option value="">Se clasifica al entrar</option>
          {productTypes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Campaña · opcional">
        <select
          value={campaignId}
          disabled={pending}
          onChange={(e) => {
            setCampaignId(e.target.value);
            save({ c: e.target.value });
          }}
          className={selectCls}
        >
          <option value="">Sin campaña</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-[11px] text-muted-foreground">
        Con sucursal + tipo, los leads se reparten por round-robin a los vendedores
        activos.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

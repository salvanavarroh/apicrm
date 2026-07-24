"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  startConnect,
  startBuyNumber,
  refreshChannelHealth,
  disconnectChannel,
} from "@/app/(app)/admin/channels/actions";

type Platform = "whatsapp" | "instagram" | "facebook";

const CONNECT_LABEL: Record<Platform, string> = {
  whatsapp: "Conectar WhatsApp",
  instagram: "Conectar Instagram",
  facebook: "Conectar Facebook",
};

/** Botón de conexión para UNA plataforma (+ comprar número en WhatsApp). */
export function PlatformConnect({ platform }: { platform: Platform }) {
  const [pending, start] = useTransition();
  const [kyc, setKyc] = useState<string | null>(null);

  function connect() {
    start(async () => {
      const res = await startConnect(platform);
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
      } else {
        toast.success("Número solicitado");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={connect} disabled={pending}>
          {CONNECT_LABEL[platform]}
        </Button>
        {platform === "whatsapp" && (
          <Button variant="outline" onClick={buy} disabled={pending}>
            Comprar número
          </Button>
        )}
      </div>
      {kyc && (
        <a
          href={kyc}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-primary underline"
        >
          Abrir verificación KYC →
        </a>
      )}
    </div>
  );
}

export function ChannelRowActions({
  channelId,
  platform,
}: {
  channelId: string;
  platform: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function refresh() {
    start(async () => {
      const res = await refreshChannelHealth(channelId);
      if (res.ok) {
        toast.success("Salud actualizada");
        router.refresh();
      } else toast.error(res.message);
    });
  }
  function disconnect() {
    if (!confirm("¿Desconectar este canal?")) return;
    start(async () => {
      const res = await disconnectChannel(channelId);
      if (res.ok) {
        toast.success("Canal desconectado");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  return (
    <div className="flex gap-2">
      {platform === "whatsapp" && (
        <Button size="sm" variant="outline" onClick={refresh} disabled={pending}>
          Salud
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={disconnect} disabled={pending}>
        Desconectar
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  startConnect,
  refreshChannelHealth,
  disconnectChannel,
} from "@/app/(app)/admin/channels/actions";

type Platform = "whatsapp" | "instagram" | "facebook";

export function ConnectButtons() {
  const [pending, start] = useTransition();

  function connect(platform: Platform) {
    start(async () => {
      const res = await startConnect(platform);
      if (res.ok) {
        window.location.href = res.authUrl;
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => connect("whatsapp")} disabled={pending}>
        Conectar WhatsApp
      </Button>
      <Button
        variant="outline"
        onClick={() => connect("facebook")}
        disabled={pending}
      >
        Conectar Facebook (Lead Ads)
      </Button>
      <Button
        variant="outline"
        onClick={() => connect("instagram")}
        disabled={pending}
      >
        Conectar Instagram
      </Button>
    </div>
  );
}

export function ChannelRowActions({ channelId, platform }: { channelId: string; platform: string }) {
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

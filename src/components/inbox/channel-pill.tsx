import { Camera, MessageCircle, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";

type Platform = "whatsapp" | "instagram" | "facebook";

const META: Record<
  Platform,
  { label: string; icon: typeof MessageCircle; cls: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    cls: "bg-emerald-100 text-emerald-700",
  },
  instagram: {
    label: "Instagram",
    icon: Camera,
    cls: "bg-fuchsia-100 text-fuchsia-700",
  },
  facebook: {
    label: "Facebook",
    icon: MessageSquare,
    cls: "bg-blue-100 text-blue-700",
  },
};

export function ChannelPill({
  platform,
  size = "md",
}: {
  platform: string;
  size?: "sm" | "md";
}) {
  const meta = META[platform as Platform] ?? META.whatsapp;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        meta.cls,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {meta.label}
    </span>
  );
}

// Sólo el color/punto para indicadores compactos.
export function channelDot(platform: string): string {
  return (
    {
      whatsapp: "bg-emerald-500",
      instagram: "bg-fuchsia-500",
      facebook: "bg-blue-500",
    }[platform] ?? "bg-muted-foreground"
  );
}

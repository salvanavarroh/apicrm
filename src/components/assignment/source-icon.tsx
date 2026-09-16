import { FileInput, Sheet } from "lucide-react";

import { BrandIcon, PLATFORM_META } from "@/components/integrations/brand-icon";
import type { SourceKind } from "@/lib/assignment-rules";
import { cn } from "@/lib/utils";

/**
 * El logo de cada puerta de entrada, en el mismo cuadrado con tinte que usa el
 * panel de Conexiones. Reusar ese lenguaje es lo que hace que un canal de
 * WhatsApp se lea igual en las dos pantallas.
 *
 * Los orígenes que no son una marca —formularios propios, planillas— llevan un
 * ícono de lucide y no un logo inventado.
 */
export function SourceIcon({
  kind,
  platform,
}: {
  kind: SourceKind;
  platform: string | null;
}) {
  const brand = platform ? PLATFORM_META[platform] : undefined;

  if (brand) {
    return (
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          brand.tint,
        )}
      >
        <BrandIcon platform={platform!} className="size-5" />
      </div>
    );
  }

  const Icon = kind === "sheet" ? Sheet : FileInput;
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4.5" />
    </div>
  );
}

/** "WhatsApp", "Instagram"… el nombre lindo de la plataforma. */
export function platformLabel(platform: string | null): string | null {
  return platform ? PLATFORM_META[platform]?.label ?? platform : null;
}

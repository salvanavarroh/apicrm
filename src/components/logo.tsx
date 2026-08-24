import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Logo de API.
 *
 * `mark` usa sólo el isotipo (el hexágono), sin el texto "API". Es lo que va en
 * el menú colapsado: ahí el texto no se lee y sólo achica el símbolo.
 */
export function Logo({
  size = 40,
  mark = false,
  className,
}: {
  size?: number;
  /** Sólo el isotipo, sin el texto. */
  mark?: boolean;
  className?: string;
}) {
  // Relación de aspecto de cada archivo: el completo es 125×62, el isotipo 56×62.
  const ratio = mark ? 56 / 62 : 125 / 62;
  return (
    <Image
      src={mark ? "/logo-mark.svg" : "/logo.svg"}
      alt="API"
      width={Math.round(size * ratio)}
      height={size}
      priority
      className={cn("h-auto", className)}
    />
  );
}

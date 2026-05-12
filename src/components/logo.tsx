import Image from "next/image";

import { cn } from "@/lib/utils";

export function Logo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="API"
      width={(size * 125) / 62}
      height={size}
      priority
      className={cn("h-auto", className)}
    />
  );
}

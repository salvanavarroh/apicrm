"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Lee `?toast=...&type=success|error` de la URL y dispara un toast al montar,
 * después limpia esos params. Pensado para mostrar feedback tras un redirect
 * desde un server action.
 */
export function FlashToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const message = params.get("toast");
    if (!message) return;

    const type = params.get("type");
    if (type === "error") toast.error(message);
    else toast.success(message);

    const next = new URLSearchParams(params);
    next.delete("toast");
    next.delete("type");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [params, pathname, router]);

  return null;
}

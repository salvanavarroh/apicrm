"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { toggleAutoAssignment } from "./actions";

export function AutoToggle({
  managementId,
  enabled,
}: {
  managementId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function flip() {
    startTransition(async () => {
      const result = await toggleAutoAssignment(managementId, !enabled);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        !enabled
          ? "Asignación automática activada"
          : "Asignación automática desactivada",
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      aria-label={enabled ? "Desactivar auto-asignación" : "Activar auto-asignación"}
      className={
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
        (enabled ? "bg-success" : "bg-muted-foreground/30")
      }
    >
      <span
        className={
          "inline-block size-5 transform rounded-full bg-white shadow transition " +
          (enabled ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

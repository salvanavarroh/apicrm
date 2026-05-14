"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { approveBranchRequest, rejectBranchRequest } from "./actions";

export function DecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function approve() {
    if (!confirm("¿Aprobar la solicitud y crear la sucursal?")) return;
    startTransition(async () => {
      const result = await approveBranchRequest(requestId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Sucursal aprobada y creada");
      router.refresh();
    });
  }

  function reject() {
    const reason =
      prompt("Motivo del rechazo (opcional, se notifica al Admin):") ?? "";
    startTransition(async () => {
      const result = await rejectBranchRequest(requestId, reason);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Solicitud rechazada");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={reject}
        disabled={pending}
        className="text-destructive"
      >
        Rechazar
      </Button>
      <Button size="sm" onClick={approve} disabled={pending}>
        Aprobar
      </Button>
    </div>
  );
}

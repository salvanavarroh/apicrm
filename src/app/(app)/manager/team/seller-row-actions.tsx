"use client";

import { Power, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ResendInviteDialog } from "@/components/users/resend-invite-dialog";
import { Button } from "@/components/ui/button";

import { resendSellerInvitation, toggleSellerStatus } from "./actions";

export function SellerRowActions({
  userId,
  status,
  email,
}: {
  userId: string;
  status: "pending" | "active" | "inactive" | "deleted";
  email?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = status === "active" ? "inactive" : "active";
      const result = await toggleSellerStatus(userId, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(next === "active" ? "Vendedor activado" : "Vendedor desactivado");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "pending" && (
        <ResendInviteDialog
          currentEmail={email ?? ""}
          action={(e) => resendSellerInvitation(userId, e)}
        />
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={status === "active" ? "Desactivar" : "Activar"}
        onClick={toggle}
        disabled={pending}
      >
        {status === "active" ? (
          <PowerOff className="size-3.5" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

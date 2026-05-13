"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { softDeleteUser, toggleUserStatus } from "./actions";

export function UserRowActions({
  userId,
  fullName,
  status,
  isSelf,
}: {
  userId: string;
  fullName: string;
  status: "pending" | "active" | "inactive" | "deleted";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = status === "active" ? "inactive" : "active";
      const result = await toggleUserStatus(userId, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(next === "active" ? "Usuario activado" : "Usuario desactivado");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar a ${fullName}? (soft-delete, se puede restaurar)`)) return;
    startTransition(async () => {
      const result = await softDeleteUser(userId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Usuario eliminado");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={status === "active" ? "Desactivar" : "Activar"}
        onClick={toggle}
        disabled={pending || isSelf}
        title={isSelf ? "No podés desactivar tu propia cuenta" : undefined}
      >
        {status === "active" ? (
          <PowerOff className="size-3.5" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-destructive"
        aria-label="Eliminar"
        onClick={remove}
        disabled={pending || isSelf}
        title={isSelf ? "No podés eliminar tu propia cuenta" : undefined}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

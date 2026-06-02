"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { softDeleteUser, toggleUserStatus } from "../actions";

type Status = "pending" | "active" | "inactive" | "deleted";

export function UserActions({
  userId,
  status,
  children,
}: {
  userId: string;
  status: Status;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isActive = status === "active";

  function toggle() {
    const next: "active" | "inactive" = isActive ? "inactive" : "active";
    if (
      !confirm(
        next === "inactive"
          ? "¿Desactivar este usuario? No va a poder ingresar."
          : "¿Reactivar este usuario?",
      )
    )
      return;
    startTransition(async () => {
      const r = await toggleUserStatus(userId, next);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(next === "active" ? "Usuario activado" : "Usuario desactivado");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("¿Eliminar este usuario? Es soft-delete reversible en DB."))
      return;
    startTransition(async () => {
      const r = await softDeleteUser(userId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Usuario eliminado");
      router.push("/admin/users");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <Button
        variant="outline"
        onClick={toggle}
        disabled={pending || status === "deleted"}
      >
        {isActive ? (
          <>
            <PowerOff className="mr-1 size-4" /> Desactivar
          </>
        ) : (
          <>
            <Power className="mr-1 size-4" /> Activar
          </>
        )}
      </Button>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={remove}
        disabled={pending || status === "deleted"}
      >
        <Trash2 className="mr-1 size-4" /> Eliminar
      </Button>
    </div>
  );
}

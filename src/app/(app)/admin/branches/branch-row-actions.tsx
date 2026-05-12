"use client";

import { PencilLine, Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteBranch, toggleBranchStatus } from "./actions";
import { BranchDialog } from "./branch-dialog";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: "active" | "inactive";
};

export function BranchRowActions({ branch }: { branch: Branch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = branch.status === "active" ? "inactive" : "active";
      const result = await toggleBranchStatus(branch.id, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        next === "active" ? "Sucursal activada" : "Sucursal desactivada",
      );
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar sucursal "${branch.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteBranch(branch.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Sucursal eliminada");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <BranchDialog
        branch={branch}
        trigger={
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Editar"
          >
            <PencilLine className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={branch.status === "active" ? "Desactivar" : "Activar"}
        onClick={toggle}
        disabled={pending}
      >
        {branch.status === "active" ? (
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
        disabled={pending}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

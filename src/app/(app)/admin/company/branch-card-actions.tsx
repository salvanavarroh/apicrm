"use client";

import { PencilLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteBranch } from "@/app/(app)/admin/branches/actions";
import { BranchDialog } from "@/app/(app)/admin/branches/branch-dialog";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: "active" | "inactive";
};

export function BranchCardActions({ branch }: { branch: Branch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/users?branch=${branch.id}`}>
          Ver lista de usuarios
        </Link>
      </Button>
      <BranchDialog
        branch={branch}
        trigger={
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Editar sucursal"
          >
            <PencilLine className="size-4" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon"
        className="size-9 text-destructive"
        aria-label="Eliminar sucursal"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

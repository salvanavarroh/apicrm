"use client";

import {
  Building2,
  MapPin,
  PencilLine,
  Phone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  deleteBranch,
  toggleBranchStatus,
} from "@/app/(app)/admin/branches/actions";
import { BranchDialog } from "@/app/(app)/admin/branches/branch-dialog";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: "active" | "inactive";
};

export function BranchDetailDialog({
  trigger,
  branch,
}: {
  trigger: ReactNode;
  branch: Branch;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" /> {branch.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <span
            className={
              branch.status === "active"
                ? "self-start rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                : "self-start rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {branch.status === "active" ? "Activa" : "Inactiva"}
          </span>

          <DetailRow icon={MapPin} label="Dirección" value={branch.address} />
          <DetailRow icon={Phone} label="Teléfono" value={branch.phone} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={pending}
            className="text-destructive"
          >
            <Trash2 className="mr-1 size-3.5" /> Eliminar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={pending}
          >
            {branch.status === "active" ? "Desactivar" : "Activar"}
          </Button>
          <BranchDialog
            branch={branch}
            trigger={
              <Button size="sm">
                <PencilLine className="mr-1 size-3.5" /> Editar
              </Button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-foreground">{value ?? "—"}</span>
      </div>
    </div>
  );
}

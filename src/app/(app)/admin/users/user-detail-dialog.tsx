"use client";

import {
  Mail,
  Phone,
  Power,
  PowerOff,
  ShieldCheck,
  Store,
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

import { softDeleteUser, toggleUserStatus } from "./actions";
import type { Role } from "./invite-user-dialog";
import { ROLE_LABELS } from "./invite-user-dialog";

type UserDetail = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role | "sales" | "super_admin";
  status: "pending" | "active" | "inactive" | "deleted";
  branchName: string | null;
  isSelf: boolean;
};

const STATUS_LABEL = {
  pending: "Pendiente",
  active: "Activo",
  inactive: "Inactivo",
  deleted: "Eliminado",
} as const;
const STATUS_CLS = {
  pending: "bg-warning/10 text-warning-foreground",
  active: "bg-success/10 text-success",
  inactive: "bg-muted text-muted-foreground",
  deleted: "bg-destructive/10 text-destructive",
} as const;

type Props = {
  user: UserDetail;
} & (
  | { trigger: ReactNode; open?: never; onOpenChange?: never }
  | { trigger?: undefined; open: boolean; onOpenChange: (v: boolean) => void }
);

export function UserDetailDialog(props: Props) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isControlled = props.trigger === undefined;
  const open = isControlled ? (props.open ?? false) : internalOpen;
  const setOpen: (v: boolean) => void = isControlled
    ? (props.onOpenChange ?? (() => {}))
    : setInternalOpen;
  const user = props.user;

  function toggle() {
    startTransition(async () => {
      const next = user.status === "active" ? "inactive" : "active";
      const result = await toggleUserStatus(user.id, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        next === "active" ? "Usuario activado" : "Usuario desactivado",
      );
      router.refresh();
      setOpen(false);
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar a ${user.fullName}? Es soft-delete.`)) return;
    startTransition(async () => {
      const result = await softDeleteUser(user.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Usuario eliminado");
      router.refresh();
      setOpen(false);
    });
  }

  const roleLabel =
    user.role in ROLE_LABELS
      ? ROLE_LABELS[user.role as Role]
      : user.role === "sales"
        ? "Vendedor"
        : user.role;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && props.trigger && (
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user.fullName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {roleLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[user.status]}`}
            >
              {STATUS_LABEL[user.status]}
            </span>
          </div>

          <Row icon={Mail} label="Email" value={user.email} />
          <Row icon={Phone} label="Teléfono" value={user.phone} />
          <Row
            icon={Store}
            label="Sucursal asignada"
            value={user.branchName}
          />
          {user.role === "admin" && (
            <Row
              icon={ShieldCheck}
              label="Permisos"
              value="Admin de la concesionaria"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={pending || user.isSelf}
            className="text-destructive"
            title={user.isSelf ? "No podés eliminar tu cuenta" : undefined}
          >
            <Trash2 className="mr-1 size-3.5" /> Eliminar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={pending || user.isSelf}
          >
            {user.status === "active" ? (
              <>
                <PowerOff className="mr-1 size-3.5" /> Desactivar
              </>
            ) : (
              <>
                <Power className="mr-1 size-3.5" /> Activar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
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

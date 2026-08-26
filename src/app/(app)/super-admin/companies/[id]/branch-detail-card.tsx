"use client";

import {
  Building2,
  ChevronDown,
  MapPin,
  Phone,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { deleteBranchAsSuperAdmin } from "./actions";

export type BranchUser = {
  id: string;
  name: string;
  role: "manager" | "supervisor" | "sales" | "data_provider";
  status: string;
};

export type BranchDetail = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: "active" | "inactive";
  providers: number;
  managers: number;
  sellers: number;
  users: BranchUser[];
};

const ROLE_LABEL: Record<BranchUser["role"], string> = {
  manager: "Gerente",
  supervisor: "Supervisor",
  sales: "Vendedor",
  data_provider: "Proveedor",
};

export function BranchDetailCard({
  branch,
  companyId,
}: {
  branch: BranchDetail;
  companyId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (
      !confirm(
        `¿Eliminar la sucursal "${branch.name}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteBranchAsSuperAdmin(branch.id, companyId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Sucursal eliminada");
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-foreground" />
            <span className="text-lg font-semibold">{branch.name}</span>
            <span
              className={
                branch.status === "active"
                  ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                  : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              }
            >
              {branch.status === "active" ? "Activa" : "Inactiva"}
            </span>
          </div>
          {branch.address && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> {branch.address}
            </p>
          )}
          {branch.phone && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5" /> {branch.phone}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Ver sucursal"
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Eliminar"
            className="text-destructive"
            onClick={remove}
            disabled={pending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <BranchStat
          icon={UserPlus}
          label="Proveedores"
          value={branch.providers}
        />
        <BranchStat icon={UserCog} label="Gerentes" value={branch.managers} />
        <BranchStat icon={Users} label="Vendedores" value={branch.sellers} />
        <BranchStat icon={Wallet} label="Leads activos" value="—" caption="Sprint 4" />
        <BranchStat icon={Wallet} label="Ventas" value="—" caption="Sprint 7" />
        <BranchStat
          icon={Wallet}
          label="Conversión"
          value="—"
          caption="Sprint 7"
        />
      </div>

      {open && (
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Usuarios de la sucursal ({branch.users.length})
          </div>
          {branch.users.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Sin usuarios asignados a esta sucursal.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {branch.users.map((u) => (
                <li
                  key={`${u.role}-${u.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {ROLE_LABEL[u.role]}
                    </span>
                    {u.status !== "active" && (
                      <span className="text-[11px] text-warning-foreground">
                        {u.status}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function BranchStat({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-accent" />
        {label}
      </div>
      <p className="text-2xl font-bold leading-none tracking-tight">{value}</p>
      {caption && (
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}

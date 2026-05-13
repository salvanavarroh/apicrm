"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { inviteUser, type InviteUserInput } from "./actions";

type Role = "admin" | "manager" | "data_provider";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Gerente",
  data_provider: "Proveedor de datos",
};

export function InviteUserDialog({
  trigger,
  branches,
  productTypes,
}: {
  trigger: ReactNode;
  branches: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [productTypeIds, setProductTypeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setRole("admin");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBranchIds([]);
      setProductTypeIds([]);
      setError(null);
    }
    setOpen(next);
  }

  function toggle(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value];
  }

  function submit() {
    startTransition(async () => {
      const base = { first_name: firstName, last_name: lastName, email, phone };
      const payload: InviteUserInput =
        role === "manager"
          ? {
              role: "manager",
              ...base,
              branch_ids: branchIds,
              product_type_ids: productTypeIds,
            }
          : { role, ...base };

      const result = await inviteUser(payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Invitación enviada a ${email}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
                <SelectItem value="data_provider">
                  Proveedor de datos
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Los <strong>Vendedores</strong> los invita el Gerente desde su
              panel.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iu-first">Nombre</Label>
              <Input
                id="iu-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iu-last">Apellido</Label>
              <Input
                id="iu-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="iu-email">Email</Label>
            <Input
              id="iu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="iu-phone">Teléfono (opcional)</Label>
            <Input
              id="iu-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {role === "manager" && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Sucursales que gestiona</Label>
                {branches.length === 0 ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Creá sucursales antes de invitar un Gerente.
                  </p>
                ) : (
                  <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                    {branches.map((b) => (
                      <label
                        key={b.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={branchIds.includes(b.id)}
                          onChange={() =>
                            setBranchIds(toggle(branchIds, b.id))
                          }
                          className="size-4 rounded border-input"
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Tipos de producto que maneja</Label>
                {productTypes.length === 0 ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Creá tipos de producto antes de invitar un Gerente.
                  </p>
                ) : (
                  <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                    {productTypes.map((pt) => (
                      <label
                        key={pt.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={productTypeIds.includes(pt.id)}
                          onChange={() =>
                            setProductTypeIds(toggle(productTypeIds, pt.id))
                          }
                          className="size-4 rounded border-input"
                        />
                        {pt.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Invitando…" : "Enviar invitación"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ROLE_LABELS };
export type { Role };

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
import { cn } from "@/lib/utils";

import { inviteUser, type InviteUserInput } from "./actions";

type Role = "admin" | "manager" | "data_provider";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Gerente de ventas",
  data_provider: "Proveedor de datos",
};

const ALL_TOKEN = "Todos";

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

  // Tipos sin "Todos": el "Todos" es un toggle UI, no un tipo en sí.
  const realProductTypes = productTypes.filter((pt) => pt.name !== ALL_TOKEN);
  const todosOption = productTypes.find((pt) => pt.name === ALL_TOKEN);

  // "Todos" está activo cuando hay tantos seleccionados como reales O cuando
  // se eligió explícitamente el "Todos" del seed.
  const allTypesSelected =
    realProductTypes.length > 0 &&
    realProductTypes.every((pt) => productTypeIds.includes(pt.id));
  const allBranchesSelected =
    branches.length > 0 && branches.every((b) => branchIds.includes(b.id));

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

  function toggleSet(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value];
  }

  function toggleAllBranches() {
    setBranchIds(allBranchesSelected ? [] : branches.map((b) => b.id));
  }

  function toggleAllTypes() {
    if (allTypesSelected) {
      setProductTypeIds([]);
    } else {
      setProductTypeIds(realProductTypes.map((pt) => pt.id));
    }
  }

  function submit() {
    startTransition(async () => {
      const base = { first_name: firstName, last_name: lastName, email, phone };
      // Si el manager eligió "Todos" como tipo, mandamos ese tipo + todos
      // los reales. Si solo eligió reales, sin "Todos".
      const finalTypeIds = allTypesSelected && todosOption
        ? [todosOption.id, ...realProductTypes.map((p) => p.id)]
        : productTypeIds;

      const payload: InviteUserInput =
        role === "manager"
          ? {
              role: "manager",
              ...base,
              branch_ids: branchIds,
              product_type_ids: finalTypeIds,
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
          <DialogTitle className="text-center text-2xl font-bold">
            Nuevo usuario
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Rol del usuario</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Gerente de ventas</SelectItem>
                <SelectItem value="data_provider">
                  Proveedor de datos
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "manager" && (
            <div className="flex flex-col gap-2">
              <Label>Seleccione la sucursal a cargo</Label>
              {branches.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Solicitá primero una sucursal al SuperAdmin.
                </p>
              ) : (
                <>
                  {branchIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {branchIds.map((id) => {
                        const b = branches.find((x) => x.id === id);
                        if (!b) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                          >
                            {b.name}
                            <button
                              type="button"
                              onClick={() =>
                                setBranchIds(toggleSet(branchIds, id))
                              }
                              className="text-destructive"
                              aria-label={`Quitar ${b.name}`}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={allBranchesSelected}
                        onChange={toggleAllBranches}
                        className="size-4 rounded border-input"
                      />
                      <span className="font-medium">Seleccionar todas</span>
                    </label>
                    {branches.map((b) => (
                      <label
                        key={b.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={branchIds.includes(b.id)}
                          onChange={() =>
                            setBranchIds(toggleSet(branchIds, b.id))
                          }
                          className="size-4 rounded border-input"
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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

          {role === "manager" && realProductTypes.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Tipo de negocio</Label>
              <div className="flex flex-wrap gap-2">
                {realProductTypes.map((pt) => {
                  const checked = productTypeIds.includes(pt.id);
                  return (
                    <button
                      type="button"
                      key={pt.id}
                      onClick={() =>
                        setProductTypeIds(toggleSet(productTypeIds, pt.id))
                      }
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                        checked
                          ? "border-success bg-success/10 text-success"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-sm border",
                          checked
                            ? "border-success bg-success text-white"
                            : "border-input",
                        )}
                      >
                        {checked && "✓"}
                      </span>
                      {pt.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={toggleAllTypes}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    allTypesSelected
                      ? "border-success bg-success/10 text-success"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border",
                      allTypesSelected
                        ? "border-success bg-success text-white"
                        : "border-input",
                    )}
                  >
                    {allTypesSelected && "✓"}
                  </span>
                  Todos
                </button>
              </div>
            </div>
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
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex-1"
            >
              {pending ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ROLE_LABELS };
export type { Role };

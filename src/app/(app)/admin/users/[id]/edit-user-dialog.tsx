"use client";

import { PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";

import { updateUserProfile } from "../actions";

type Props = {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    role: string;
    branch_id: string | null;
    commission_percent: number | null;
    commission_conditions: string;
    can_export_leads?: boolean;
  };
  branches: { id: string; name: string }[];
};

export function EditUserDialog({ user, branches }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    branch_id: user.branch_id ?? "",
    commission_percent:
      user.commission_percent !== null ? String(user.commission_percent) : "",
    commission_conditions: user.commission_conditions,
    can_export_leads: user.can_export_leads ?? false,
  });

  const isVendor = user.role === "sales";
  const isManager = user.role === "manager";

  function submit() {
    startTransition(async () => {
      const r = await updateUserProfile(user.id, {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        branch_id: data.branch_id || null,
        commission_percent: isVendor
          ? data.commission_percent === ""
            ? null
            : Number(data.commission_percent)
          : null,
        commission_conditions: isVendor ? data.commission_conditions : "",
        can_export_leads: isManager ? data.can_export_leads : undefined,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Perfil actualizado");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-card">
          <PencilLine className="mr-1 size-4" /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            El email y el rol no se pueden cambiar desde acá. Para eso, eliminá
            y volvé a invitar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input
                value={data.first_name}
                onChange={(e) =>
                  setData((d) => ({ ...d, first_name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Apellido</Label>
              <Input
                value={data.last_name}
                onChange={(e) =>
                  setData((d) => ({ ...d, last_name: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={user.email} disabled />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input
              value={data.phone}
              onChange={(e) =>
                setData((d) => ({ ...d, phone: e.target.value }))
              }
            />
          </div>
          {(isVendor || user.role === "manager") && branches.length > 0 && (
            <div>
              <Label className="text-xs">Sucursal</Label>
              <Select
                value={data.branch_id}
                onValueChange={(v) =>
                  setData((d) => ({ ...d, branch_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isManager && (
            <label className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
              <input
                type="checkbox"
                checked={data.can_export_leads}
                onChange={(e) =>
                  setData((d) => ({ ...d, can_export_leads: e.target.checked }))
                }
                className="size-4 rounded border-input"
              />
              <span>
                Puede descargar base de leads
                <span className="block text-xs text-muted-foreground">
                  Habilita el botón Exportar en el listado de leads.
                </span>
              </span>
            </label>
          )}
          {isVendor && (
            <>
              <div>
                <Label className="text-xs">Comisión (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={data.commission_percent}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      commission_percent: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Condiciones de comisión</Label>
                <Textarea
                  rows={2}
                  value={data.commission_conditions}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      commission_conditions: e.target.value,
                    }))
                  }
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fullName } from "@/lib/leads";

import { reassignLead } from "@/app/(app)/admin/leads/actions";

export type AssignableUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  productTypeIds: string[];
};

type Props = {
  trigger: React.ReactNode;
  leadId: string;
  leadProductTypeId: string | null;
  currentAssigneeId: string | null;
  users: AssignableUser[];
};

export function ReassignDialog({
  trigger,
  leadId,
  leadProductTypeId,
  currentAssigneeId,
  users,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(currentAssigneeId ?? "__none__");
  const [pending, startTransition] = useTransition();

  const eligible = leadProductTypeId
    ? users.filter((u) => u.productTypeIds.includes(leadProductTypeId))
    : users;

  function submit() {
    const newAssignee = value === "__none__" ? null : value;
    startTransition(async () => {
      const result = await reassignLead(leadId, newAssignee);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(newAssignee ? "Lead reasignado" : "Lead desasignado");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reasignar lead</DialogTitle>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay vendedores disponibles con el tipo de producto de este lead.
          </p>
        ) : (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Elegí un vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sin asignar —</SelectItem>
              {eligible.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {fullName(u.first_name, u.last_name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || eligible.length === 0}>
            {pending ? "Guardando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

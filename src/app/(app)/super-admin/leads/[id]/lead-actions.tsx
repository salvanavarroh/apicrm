"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMERCIAL_LEAD_STATUSES,
  COMMERCIAL_LEAD_STATUS_LABEL,
  type CommercialLeadStatus,
} from "@/lib/commercial-leads";

import {
  deleteCommercialLead,
  updateCommercialLeadStatus,
} from "../actions";

export function CommercialLeadActions({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: CommercialLeadStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: CommercialLeadStatus) {
    if (next === currentStatus) return;
    startTransition(async () => {
      const r = await updateCommercialLeadStatus(leadId, next);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(
        `Marcado como ${COMMERCIAL_LEAD_STATUS_LABEL[next].toLowerCase()}`,
      );
      router.refresh();
    });
  }

  function remove() {
    if (
      !confirm(
        "¿Eliminar este lead? Se borran también todas las notas asociadas.",
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteCommercialLead(leadId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Lead eliminado");
      router.push("/super-admin/leads");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={currentStatus}
        onValueChange={(v) => setStatus(v as CommercialLeadStatus)}
        disabled={pending}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMERCIAL_LEAD_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {COMMERCIAL_LEAD_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="mr-1 size-4" /> Eliminar
      </Button>
    </div>
  );
}

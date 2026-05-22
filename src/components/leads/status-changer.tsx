"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";

import { updateLeadStatus } from "@/app/(app)/admin/leads/actions";

const OPTIONS: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
  "evaluating",
  "accepted",
  "rejected",
  "closed",
  "not_interested",
];

export function StatusChanger({
  leadId,
  current,
}: {
  leadId: string;
  current: LeadStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<LeadStatus>(current);
  const [, startTransition] = useTransition();

  function change(next: string) {
    const target = next as LeadStatus;
    if (target === value) return;
    const prev = value;
    setValue(target);
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, target);
      if (!result.ok) {
        toast.error(result.message);
        setValue(prev);
        return;
      }
      toast.success(`Estado: ${LEAD_STATUS_LABELS[target]}`);
      router.refresh();
    });
  }

  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

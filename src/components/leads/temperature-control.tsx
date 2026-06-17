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
import {
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_META,
  LEAD_TEMPERATURE_OPTIONS,
  type LeadTemperature,
} from "@/lib/leads";
import { cn } from "@/lib/utils";

import { updateLeadTemperature } from "@/app/(app)/admin/leads/actions";

const NONE = "none";

/** Badge compacto para tabla/kanban. */
export function TemperatureBadge({
  temperature,
  className,
}: {
  temperature: LeadTemperature | null;
  className?: string;
}) {
  if (!temperature) {
    return (
      <span className={cn("text-xs text-muted-foreground/60", className)}>
        —
      </span>
    );
  }
  const meta = LEAD_TEMPERATURE_META[temperature];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.badge,
        className,
      )}
    >
      <span aria-hidden>{meta.emoji}</span>
      {LEAD_TEMPERATURE_LABELS[temperature]}
    </span>
  );
}

/** Selector inline con persistencia optimista. */
export function TemperatureChanger({
  leadId,
  current,
  className,
}: {
  leadId: string;
  current: LeadTemperature | null;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<LeadTemperature | null>(current);
  const [, startTransition] = useTransition();

  function change(next: string) {
    const target = next === NONE ? null : (next as LeadTemperature);
    if (target === value) return;
    const prev = value;
    setValue(target);
    startTransition(async () => {
      const result = await updateLeadTemperature(leadId, target);
      if (!result.ok) {
        toast.error(result.message);
        setValue(prev);
        return;
      }
      toast.success(
        target
          ? `Temperatura: ${LEAD_TEMPERATURE_LABELS[target]}`
          : "Temperatura quitada",
      );
      router.refresh();
    });
  }

  return (
    <Select value={value ?? NONE} onValueChange={change}>
      <SelectTrigger className={cn("w-44", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin clasificar</SelectItem>
        {LEAD_TEMPERATURE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {LEAD_TEMPERATURE_META[o.value].emoji} {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INTEREST_META,
  INTEREST_ORDER,
  daysUntilBirthday,
  interestLabel,
  type InterestKind,
  type LeadInterest,
} from "@/lib/lead-interests";
import {
  addLeadInterest,
  removeLeadInterest,
} from "@/lib/lead-interests-actions";
import { cn } from "@/lib/utils";

// ============================================================================
// Intereses del cliente: chips para romper el hielo.
//
// La regla de diseño es que cargar un dato tiene que costar menos que no
// cargarlo. Si toma más de dos toques, el vendedor no lo usa. De ahí que los
// tipos más frecuentes estén como botones directos y el resto en un select.
// ============================================================================

// Los que se ofrecen como botón directo; el resto va en el select de "otro tipo".
const QUICK: InterestKind[] = ["cuadro", "cumpleanos", "familia", "hobby"];

const MONTH_OPTIONS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function InterestsSection({
  leadId,
  interests,
  compact = false,
  onChanged,
}: {
  leadId: string;
  interests: LeadInterest[];
  /** En el inbox el espacio es angosto: menos aire y sin título grande. */
  compact?: boolean;
  /**
   * El inbox carga los datos por server action, no por render del server, así
   * que `router.refresh()` no le alcanza: necesita recargar a mano.
   */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<InterestKind | null>(null);
  const [value, setValue] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");

  function reset() {
    setAdding(null);
    setValue("");
    setDay("");
    setMonth("");
  }

  function submit() {
    if (!adding) return;
    const isBirthday = adding === "cumpleanos";
    start(async () => {
      const res = await addLeadInterest({
        leadId,
        kind: adding,
        // El cumpleaños no tiene texto libre: el valor es la fecha misma.
        value: isBirthday ? `${day}/${month}` : value,
        day: isBirthday ? Number(day) : null,
        month: isBirthday ? Number(month) : null,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      reset();
      router.refresh();
      onChanged?.();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await removeLeadInterest(id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.refresh();
      onChanged?.();
    });
  }

  const sorted = [...interests].sort(
    (a, b) =>
      INTEREST_ORDER.indexOf(a.kind) - INTEREST_ORDER.indexOf(b.kind),
  );
  const canSubmit =
    adding === "cumpleanos" ? Boolean(day && month) : value.trim().length > 0;

  return (
    <div className={cn("flex flex-col gap-2.5", !compact && "gap-3")}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Para romper el hielo
          </h3>
          <span className="text-[10px] text-muted-foreground">
            No cargues información sensible
          </span>
        </div>
      )}

      {/* Chips cargados */}
      <div className="flex flex-wrap items-center gap-1.5">
        {sorted.map((i) => {
          const meta = INTEREST_META[i.kind];
          const days = daysUntilBirthday(i);
          // El cumpleaños cercano se resalta: es la razón de tener el dato.
          const soon = days !== null && days <= 7;
          return (
            <span
              key={i.id}
              title={`${meta.label}${i.detail ? ` · ${i.detail}` : ""}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-xs font-medium",
                soon
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-card",
              )}
            >
              <span aria-hidden>{meta.emoji}</span>
              {interestLabel(i)}
              {soon && (
                <span className="font-semibold">
                  {days === 0 ? "· hoy" : `· en ${days} d`}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i.id)}
                disabled={pending}
                aria-label={`Quitar ${meta.label}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}

        {sorted.length === 0 && !adding && (
          <span className="text-xs text-muted-foreground">
            Nada cargado todavía.
          </span>
        )}
      </div>

      {/* Botones de carga rápida */}
      {!adding && (
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK.filter(
            (k) => k === "familia" || !sorted.some((i) => i.kind === k),
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAdding(k)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
            >
              <Plus className="size-3" />
              {INTEREST_META[k].emoji} {INTEREST_META[k].label}
            </button>
          ))}
          <Select
            value=""
            onValueChange={(v) => setAdding(v as InterestKind)}
          >
            <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-dashed px-2.5 text-xs text-muted-foreground">
              <SelectValue placeholder="Otro dato" />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_ORDER.filter((k) => !QUICK.includes(k)).map((k) => (
                <SelectItem key={k} value={k}>
                  {INTEREST_META[k].emoji} {INTEREST_META[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Formulario inline del tipo elegido */}
      {adding && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5">
          <span className="text-xs font-semibold">
            {INTEREST_META[adding].emoji} {INTEREST_META[adding].label}
          </span>

          {adding === "cumpleanos" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="Día"
                className="h-8 w-20"
              />
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
                if (e.key === "Escape") reset();
              }}
              placeholder={INTEREST_META[adding].placeholder}
              className="h-8"
            />
          )}

          {INTEREST_META[adding].hint && (
            <p className="text-[11px] text-muted-foreground">
              {INTEREST_META[adding].hint}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!canSubmit || pending}
              onClick={submit}
            >
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={reset}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

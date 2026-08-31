"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

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
  type InterestKind,
} from "@/lib/lead-interests";
import { cn } from "@/lib/utils";

// ============================================================================
// "Para romper el hielo" en el ALTA de un lead.
//
// La sección de la ficha (`InterestsSection`) escribe contra el server en cada
// clic, y para eso necesita un `leadId` que todavía no existe. Este componente
// es la variante de buffer: junta los datos en memoria y el formulario los graba
// recién después de crear el lead.
//
// Por qué en el alta y no sólo en la ficha: el momento en que el vendedor sabe
// de qué cuadro es el cliente es justo cuando acaba de hablar con él. Si el dato
// hay que ir a cargarlo a otra pantalla, no se carga.
// ============================================================================

export type PendingInterest = {
  kind: InterestKind;
  value: string;
  day?: number | null;
  month?: number | null;
};

const QUICK: InterestKind[] = ["cuadro", "cumpleanos", "familia", "hobby"];

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function PendingInterests({
  value,
  onChange,
}: {
  value: PendingInterest[];
  onChange: (next: PendingInterest[]) => void;
}) {
  const [open, setOpen] = useState<InterestKind | null>(null);
  const [text, setText] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");

  function reset() {
    setOpen(null);
    setText("");
    setDay("");
    setMonth("");
  }

  function add() {
    if (!open) return;
    if (open === "cumpleanos") {
      const d = Number(day);
      const m = Number(month);
      if (!d || !m) return;
      onChange([
        ...value,
        { kind: open, value: `${d}/${m}`, day: d, month: m },
      ]);
      reset();
      return;
    }
    const v = text.trim();
    if (!v) return;
    onChange([...value, { kind: open, value: v }]);
    reset();
  }

  const label = (i: PendingInterest) =>
    i.kind === "cumpleanos" && i.day && i.month
      ? `${i.day} ${MONTHS[i.month - 1]?.slice(0, 3)}`
      : i.value;

  return (
    <div className="flex flex-col gap-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((i, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-0.5 pr-1 pl-2 text-xs text-accent"
            >
              <span>{INTEREST_META[i.kind].emoji}</span>
              <span className="max-w-[160px] truncate">{label(i)}</span>
              <button
                type="button"
                aria-label={`Quitar ${INTEREST_META[i.kind].label}`}
                onClick={() => onChange(value.filter((_, k) => k !== idx))}
                className="rounded-full p-0.5 hover:bg-accent/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open === null ? (
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOpen(k)}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
            >
              <Plus className="size-3" /> {INTEREST_META[k].emoji}{" "}
              {INTEREST_META[k].label}
            </button>
          ))}
          <Select value="" onValueChange={(v) => setOpen(v as InterestKind)}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
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
      ) : (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2.5">
          <span className="text-xs font-semibold">
            {INTEREST_META[open].emoji} {INTEREST_META[open].label}
          </span>
          {open === "cumpleanos" ? (
            <>
              <Input
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="Día"
                className="h-8 w-16"
                aria-label="Día"
              />
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={INTEREST_META[open].placeholder}
              className={cn("h-8 w-52")}
              autoFocus
            />
          )}
          <Button type="button" size="sm" className="h-8" onClick={add}>
            Agregar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={reset}
          >
            Cancelar
          </Button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Lo que sirve para arrancar la próxima conversación. No cargues
        información sensible.
      </p>
    </div>
  );
}

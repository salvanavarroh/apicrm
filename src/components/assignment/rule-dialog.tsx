"use client";

import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildWheel,
  reduceWeights,
  ruleModeMeta,
  weightsToPercent,
  type RuleMember,
  type RuleMode,
  type SourceKind,
  type VendorOption,
} from "@/lib/assignment-rules";
import { cn } from "@/lib/utils";

import { saveAssignmentRule } from "@/app/(app)/admin/reparto/actions";

type Mode = RuleMode | "inherit";

/**
 * "¿Quién atiende los leads que entran por acá?".
 *
 * Es el MISMO diálogo para todos los orígenes —formulario de Meta, formulario
 * propio, planilla, canal de WhatsApp y la regla de la empresa—. Que sea uno
 * solo es la mitad del punto del rediseño: antes cada origen tenía su propia
 * pantalla, su propio vocabulario y, en dos casos, ninguna.
 */
export function AssignmentRuleDialog({
  sourceKind,
  sourceId,
  sourceName,
  mode: initialMode,
  members: initialMembers,
  vendors,
  defaultRuleLabel,
  trigger,
}: {
  sourceKind: SourceKind;
  /** Vacío = la regla de la empresa (no puede heredar de nadie). */
  sourceId: string;
  sourceName: string;
  mode: Mode;
  members: RuleMember[];
  vendors: VendorOption[];
  /** Qué hace hoy la regla de la empresa, para el texto de "heredar". */
  defaultRuleLabel: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [members, setMembers] = useState<RuleMember[]>(initialMembers);

  const isCompanyRule = sourceId === "";

  function reset(next: boolean) {
    if (next) {
      setMode(initialMode);
      setMembers(initialMembers);
    }
    setOpen(next);
  }

  function toggleVendor(userId: string) {
    setMembers((prev) =>
      prev.some((m) => m.userId === userId)
        ? prev.filter((m) => m.userId !== userId)
        : [...prev, { userId, weight: 1 }],
    );
  }

  function setWeight(userId: string, weight: number) {
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, weight } : m)),
    );
  }

  async function save() {
    setPending(true);
    try {
      const res = await saveAssignmentRule({
        kind: sourceKind,
        sourceId,
        mode,
        members: mode === "turns" || mode === "fixed" ? reduceWeights(members) : [],
        name: isCompanyRule ? undefined : `Reparto de ${sourceName}`,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Reparto guardado");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  // Preview: los próximos turnos con los pesos elegidos. Usa exactamente la
  // misma rueda que reparte la base, así lo que se ve acá es lo que va a pasar.
  const wheel =
    mode === "turns" || mode === "fixed" ? buildWheel(reduceWeights(members)) : [];
  const percent = weightsToPercent(members);
  const nameOf = (id: string) =>
    vendors.find((v) => v.id === id)?.name.split(" ")[0] ?? "?";

  const options: Mode[] = isCompanyRule
    ? ["balanced", "turns", "fixed", "pool"]
    : ["inherit", "balanced", "turns", "fixed", "pool"];

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCompanyRule ? "Reparto por defecto" : "Reparto de leads"}
          </DialogTitle>
          <DialogDescription>
            {isCompanyRule
              ? "La usan todas las entradas que no tengan una regla propia."
              : `Quién atiende los leads que entren por “${sourceName}”.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {options.map((value) => {
            const meta =
              value === "inherit"
                ? {
                    label: "Usar la regla de la empresa",
                    hint: `Hoy: ${defaultRuleLabel}. Si mañana cambia, este origen la sigue.`,
                  }
                : ruleModeMeta(value);
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "border-accent bg-accent/5" : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      active ? "border-accent" : "border-input",
                    )}
                  >
                    {active && <span className="size-2 rounded-full bg-accent" />}
                  </span>
                  <span className="text-sm font-medium">{meta.label}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">
                  {meta.hint}
                </p>
              </button>
            );
          })}
        </div>

        {mode === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Vendedor
            </label>
            <select
              value={members[0]?.userId ?? ""}
              onChange={(e) =>
                setMembers(e.target.value ? [{ userId: e.target.value, weight: 1 }] : [])
              }
              className="rounded-md border bg-background px-2.5 py-2 text-sm"
            >
              <option value="">Elegí un vendedor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.branch ? ` · ${v.branch}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "turns" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Vendedores en la rotación ({members.length})
            </label>
            <div className="max-h-52 divide-y overflow-y-auto rounded-md border">
              {vendors.map((v) => {
                const m = members.find((x) => x.userId === v.id);
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={!!m}
                      onCheckedChange={() => toggleVendor(v.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {m ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={m.weight}
                          onChange={(e) =>
                            setWeight(v.id, Number(e.target.value) || 1)
                          }
                          className="w-16 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums"
                        />
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {percent.get(v.id) ?? 0}%
                        </span>
                      </span>
                    ) : (
                      v.branch && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {v.branch}
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {wheel.length > 1 && (
              <div className="rounded-md bg-muted/60 px-3 py-2">
                <p className="text-xs font-medium">Los próximos leads</p>
                <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                  {Array.from({ length: Math.min(12, wheel.length * 2) }, (_, i) =>
                    nameOf(wheel[i % wheel.length]),
                  ).join("  ")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Los turnos se intercalan: nadie recibe varios seguidos por
                  tener más peso.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Si en el momento del lead ninguno está activo, queda en el pool:
              nunca se le da a alguien que no elegiste.
            </p>
          </div>
        )}

        {vendors.length === 0 && (mode === "turns" || mode === "fixed") && (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Users className="size-3.5 shrink-0" />
            No hay vendedores activos en la empresa.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

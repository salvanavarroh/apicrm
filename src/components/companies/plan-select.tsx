"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  planDefinition,
  planPriceLabel,
  selectablePlans,
  type CompanyPlan,
} from "@/lib/plans";

// ============================================================================
// Selector de plan de la concesionaria (panel del SuperAdmin).
//
// Muestra el precio de LISTA del plan como referencia pero NO autocompleta el
// campo "Precio mensual a cobrar": el precio de lista está definido en USD y el
// importe a facturar hoy se muestra en pesos. Autocompletar mezclaría monedas y
// dejaría facturas mal. Cuando se defina la moneda de facturación, esto pasa a
// autocompletar en una línea.
// ============================================================================

const NONE = "none";

export function PlanSelect({
  value,
  onChange,
  disabled,
}: {
  value: CompanyPlan | null;
  onChange: (plan: CompanyPlan | null) => void;
  disabled?: boolean;
}) {
  const options = selectablePlans(value);
  const current = planDefinition(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : (v as CompanyPlan))}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sin plan asignado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin plan asignado</SelectItem>
          {options.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
              {p.priceUsd !== null && ` — USD ${p.priceUsd}/mes`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Precio de lista: {planPriceLabel(current.key)}
          </span>{" "}
          · {current.description}
        </p>
      )}
    </div>
  );
}

/** Badge compacto para listados. */
export function PlanBadge({ plan }: { plan: CompanyPlan | null }) {
  const def = planDefinition(plan);
  if (!def) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        Sin plan
      </span>
    );
  }
  return (
    <span
      title={def.description}
      className={
        def.available
          ? "inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
          : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      }
    >
      {def.label}
    </span>
  );
}

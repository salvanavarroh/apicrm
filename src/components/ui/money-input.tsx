"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type Props = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange"
> & {
  // Valor crudo (sólo dígitos). Acepta number, string o "" para vacío.
  value: string | number | null | undefined;
  onValueChange: (raw: string) => void;
};

function formatDisplay(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-AR");
}

/**
 * Input específico para valores monetarios:
 * - Prefijo `$` fijo a la izquierda.
 * - Formatea con separador de miles (`.`) mientras tipeás.
 * - Devuelve el valor crudo (sólo dígitos) por onValueChange.
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  disabled,
  placeholder,
  ...rest
}: Props) {
  const display = formatDisplay(value);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onValueChange(digits);
        }}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-card py-1 pl-7 pr-3 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      />
    </div>
  );
}

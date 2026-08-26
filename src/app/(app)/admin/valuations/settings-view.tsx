"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  saveValuationSettings,
  type SettingsView,
} from "@/app/(app)/admin/valuations/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { valuate, type VehicleCondition } from "@/lib/used-prices/valuate";

const CONDITIONS: VehicleCondition[] = ["excelente", "bueno", "regular", "malo"];
const COND_LABEL: Record<VehicleCondition, string> = {
  excelente: "Excelente",
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
};

function money(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * Parámetros del cotizador.
 *
 * Con vista previa en vivo: un porcentaje suelto no dice nada, pero "sobre un
 * auto de 20 millones esto ofrece 17,2" sí. Es la diferencia entre que el
 * gerente entienda lo que está cambiando y que toque números al azar.
 */
export function ValuationSettingsView({
  initial,
  currentYear,
}: {
  initial: SettingsView;
  currentYear: number;
}) {
  const [f, setF] = useState({
    reconPercent: String(initial.reconPercent),
    marginPercent: String(initial.marginPercent),
    kmPerYear: String(initial.kmPerYear),
    kmPenaltyPer10k: String(initial.kmPenaltyPer10k),
    kmBonusPer10k: String(initial.kmBonusPer10k),
    kmAdjustCap: String(initial.kmAdjustCap),
    spreadPercent: String(initial.spreadPercent),
    usdRate: initial.usdRate != null ? String(initial.usdRate) : "",
  });
  const [cond, setCond] = useState<Record<VehicleCondition, string>>({
    excelente: String(initial.conditionAdjust.excelente ?? 3),
    bueno: String(initial.conditionAdjust.bueno ?? 0),
    regular: String(initial.conditionAdjust.regular ?? -5),
    malo: String(initial.conditionAdjust.malo ?? -12),
  });
  const [pending, start] = useTransition();

  const num = (v: string, fallback = 0) => (v === "" ? fallback : Number(v));
  const settings = {
    reconPercent: num(f.reconPercent),
    marginPercent: num(f.marginPercent),
    kmPerYear: num(f.kmPerYear, 15000),
    kmPenaltyPer10k: num(f.kmPenaltyPer10k),
    kmBonusPer10k: num(f.kmBonusPer10k),
    kmAdjustCap: num(f.kmAdjustCap, 15),
    spreadPercent: num(f.spreadPercent),
    conditionAdjust: {
      excelente: num(cond.excelente),
      bueno: num(cond.bueno),
      regular: num(cond.regular),
      malo: num(cond.malo),
    },
  };

  // Ejemplo fijo: un auto de $20.000.000, 4 años, con los km justos.
  const preview = valuate(
    {
      guideValue: 20_000_000,
      year: currentYear - 4,
      km: settings.kmPerYear * 4,
      condition: "bueno",
      currentYear,
    },
    settings,
  );
  const rodado = valuate(
    {
      guideValue: 20_000_000,
      year: currentYear - 4,
      km: settings.kmPerYear * 4 + 60000,
      condition: "regular",
      currentYear,
    },
    settings,
  );

  function submit() {
    start(async () => {
      const res = await saveValuationSettings({
        ...settings,
        usdRate: f.usdRate === "" ? null : Number(f.usdRate),
      });
      toast[res.ok ? "success" : "error"](
        res.ok ? "Parámetros guardados" : res.message,
      );
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">De mercado a toma</h2>
          <p className="text-xs text-muted-foreground">
            Lo que se le descuenta al valor de mercado para llegar a lo que se
            ofrece. Es la diferencia entre lo que vale el auto y lo que conviene
            pagarlo.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Num label="Reacondicionamiento %" value={f.reconPercent} onChange={(v) => setF({ ...f, reconPercent: v })} />
            <Num label="Margen %" value={f.marginPercent} onChange={(v) => setF({ ...f, marginPercent: v })} />
            <Num label="Amplitud del rango %" value={f.spreadPercent} onChange={(v) => setF({ ...f, spreadPercent: v })} />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Kilómetros</h2>
          <p className="text-xs text-muted-foreground">
            Con los km esperados por año se decide si el auto está muy rodado. El
            premio por pocos km conviene menor que el castigo por muchos: pagar de
            más por un auto poco rodado es un riesgo, no una ganancia.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Num label="Km por año" value={f.kmPerYear} onChange={(v) => setF({ ...f, kmPerYear: v })} step={1000} />
            <Num label="Castigo por 10.000 km" value={f.kmPenaltyPer10k} onChange={(v) => setF({ ...f, kmPenaltyPer10k: v })} />
            <Num label="Premio por 10.000 km" value={f.kmBonusPer10k} onChange={(v) => setF({ ...f, kmBonusPer10k: v })} />
            <Num label="Tope del ajuste %" value={f.kmAdjustCap} onChange={(v) => setF({ ...f, kmAdjustCap: v })} />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Estado del vehículo</h2>
          <p className="text-xs text-muted-foreground">
            Puntos porcentuales sobre el valor de guía. En negativo para castigar.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {CONDITIONS.map((c) => (
              <Num
                key={c}
                label={COND_LABEL[c]}
                value={cond[c]}
                onChange={(v) => setCond({ ...cond, [c]: v })}
              />
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Dólar</h2>
          <p className="text-xs text-muted-foreground">
            La guía publica algunos vehículos en dólares (importados y premium).
            Si cargás una cotización, el cotizador muestra además el equivalente
            en pesos. Vacío = se cotiza en dólares y no se convierte, que es
            preferible a inventar un tipo de cambio.
            {initial.usdRateUpdatedAt && (
              <>
                {" "}
                Última actualización:{" "}
                {new Date(initial.usdRateUpdatedAt).toLocaleDateString("es-AR")}.
              </>
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Num label="Pesos por dólar" value={f.usdRate} onChange={(v) => setF({ ...f, usdRate: v })} step={10} />
          </div>
        </Card>

        <div>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : "Guardar parámetros"}
          </Button>
        </div>
      </div>

      {/* Vista previa: qué hacen estos números sobre un auto concreto. */}
      <Card className="flex h-fit flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Cómo queda</h2>
        <p className="text-xs text-muted-foreground">
          Sobre un auto de guía {money(20_000_000)}, {currentYear - 4}.
        </p>

        <div className="flex flex-col gap-1 rounded-md border p-2.5">
          <p className="text-[11px] text-muted-foreground">
            Km justos · estado bueno
          </p>
          <p className="text-sm">Mercado {money(preview.marketValue)}</p>
          <p className="text-sm font-semibold text-accent">
            Toma {money(preview.offerMin)} – {money(preview.offerMax)}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-md border p-2.5">
          <p className="text-[11px] text-muted-foreground">
            60.000 km de más · estado regular
          </p>
          <p className="text-sm">Mercado {money(rodado.marketValue)}</p>
          <p className="text-sm font-semibold text-accent">
            Toma {money(rodado.offerMin)} – {money(rodado.offerMax)}
          </p>
        </div>

        {settings.reconPercent + settings.marginPercent > 25 && (
          <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-text">
            Estás descontando más del 25% del valor de mercado. Es probable que el
            cliente venda el auto por su cuenta.
          </p>
        )}
        {settings.reconPercent + settings.marginPercent < 5 && (
          <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-text">
            Menos del 5% de descuento deja poco margen para reacondicionar y
            rotar el usado.
          </p>
        )}
      </Card>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 font-mono"
      />
    </div>
  );
}

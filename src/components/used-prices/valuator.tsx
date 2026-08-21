"use client";

import { Calculator, Loader2, Send, TriangleAlert } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  guideBrands,
  guideModels,
  guideVersions,
  guideYears,
  quoteUsedCar,
  saveValuation,
  type QuoteResult,
} from "@/app/(app)/admin/valuations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONDITION_LABEL, type VehicleCondition } from "@/lib/used-prices/valuate";
import { cn } from "@/lib/utils";

const CONDITIONS: VehicleCondition[] = ["excelente", "bueno", "regular", "malo"];

function money(n: number, currency: "ARS" | "USD" = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function asOfLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${meses[Number(m) - 1]} ${y}`;
}

/**
 * Cotizador de usados.
 *
 * Se usa en la ficha del lead y en el inbox. `onSend` sólo se pasa donde hay un
 * canal para mandarlo (el inbox): en la ficha se guarda y nada más.
 */
export function Valuator({
  leadId,
  conversationId,
  onSend,
  onSaved,
  compact = false,
}: {
  leadId?: string | null;
  conversationId?: string | null;
  /** Si está, aparece el botón de enviar con el texto ya armado. */
  onSend?: (text: string) => Promise<void> | void;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [km, setKm] = useState("");
  const [condition, setCondition] = useState<VehicleCondition>("bueno");

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [offer, setOffer] = useState("");
  const [loading, start] = useTransition();
  const [saving, startSave] = useTransition();

  // Cascada: cada nivel limpia los de abajo. Va en los handlers y no en efectos
  // —además de que el lint no permite setState dentro de un effect— porque el
  // reset es consecuencia de la ACCIÓN del usuario, no de un cambio de estado.
  // Si quedara desincronizado, saldría un modelo de Ford con versión de Fiat y
  // el precio de otro auto.
  useEffect(() => {
    guideBrands().then((r) => setBrands(r.map((x) => x.value)));
  }, []);

  function pickBrand(v: string) {
    setBrand(v);
    setModel("");
    setVersion("");
    setYear("");
    setVersions([]);
    setYears([]);
    setQuote(null);
    setModels([]);
    if (v) guideModels(v).then((r) => setModels(r.map((x) => x.value)));
  }

  function pickModel(v: string) {
    setModel(v);
    setVersion("");
    setYear("");
    setYears([]);
    setQuote(null);
    setVersions([]);
    if (brand && v) {
      guideVersions(brand, v).then((r) => setVersions(r.map((x) => x.value)));
    }
  }

  function pickVersion(v: string) {
    setVersion(v);
    setYear("");
    setQuote(null);
    setYears([]);
    if (brand && model && v) guideYears(brand, model, v).then(setYears);
  }

  const canQuote = Boolean(brand && model && version && year && km !== "");

  function run() {
    start(async () => {
      const res = await quoteUsedCar({
        brand,
        model,
        version,
        year: Number(year),
        km: Number(km),
        condition,
      });
      if (!res.ok) {
        toast.error(res.message);
        setQuote(null);
        return;
      }
      setQuote(res.quote);
      setOffer(String(res.quote.offerSuggested));
    });
  }

  function persist(markSent: boolean) {
    if (!quote) return;
    startSave(async () => {
      const res = await saveValuation({
        quote,
        leadId: leadId ?? null,
        conversationId: conversationId ?? null,
        offerSent: offer === "" ? null : Number(offer),
        markSent,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (markSent && onSend) {
        await onSend(clientText(quote, Number(offer)));
      }
      toast.success(markSent ? "Cotización enviada y guardada" : "Cotización guardada");
      onSaved?.();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-3")}>
        <Field label="Marca">
          <Combo value={brand} onChange={pickBrand} options={brands} placeholder="Marca" />
        </Field>
        <Field label="Modelo">
          <Combo
            value={model}
            onChange={pickModel}
            options={models}
            placeholder={brand ? "Modelo" : "Elegí la marca"}
            disabled={!brand}
          />
        </Field>
        <Field label="Versión" className={compact ? "col-span-2" : "sm:col-span-3"}>
          <Combo
            value={version}
            onChange={pickVersion}
            options={versions}
            placeholder={model ? "Versión" : "Elegí el modelo"}
            disabled={!model}
          />
        </Field>
        <Field label="Año">
          <Select
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setQuote(null);
            }}
            disabled={!version}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={version ? "Año" : "—"} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kilómetros">
          <Input
            type="number"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="85000"
            className="h-9"
          />
        </Field>
        <Field label="Estado">
          <Select
            value={condition}
            onValueChange={(v) => setCondition(v as VehicleCondition)}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Button onClick={run} disabled={!canQuote || loading} size="sm">
        {loading ? (
          <Loader2 className="mr-2 size-3.5 animate-spin" />
        ) : (
          <Calculator className="mr-2 size-3.5" />
        )}
        Cotizar
      </Button>

      {quote && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          {/* Los dos números, separados a propósito: el cliente los confunde. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Vale en el mercado</p>
              <p className="text-lg font-semibold">
                {money(quote.marketValue, quote.currency)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Guía ACARA de {asOfLabel(quote.guideAsOf)} ·{" "}
                {money(quote.guideValue, quote.currency)}
              </p>
            </div>
            <div className="rounded-md border border-accent/40 bg-accent/5 p-2.5">
              <p className="text-[11px] text-muted-foreground">Toma sugerida</p>
              <p className="text-lg font-semibold text-accent">
                {money(quote.offerMin, quote.currency)} –{" "}
                {money(quote.offerMax, quote.currency)}
              </p>
              {quote.arsEquivalent != null && (
                <p className="text-[10px] text-muted-foreground">
                  ≈ {money(quote.arsEquivalent)} al cambio cargado
                </p>
              )}
            </div>
          </div>

          {/* El desglose: es lo que le contesta al gerente "de dónde sale". */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Cómo se llegó a ese número
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {quote.steps.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span>
                    <b>{s.label}</b>{" "}
                    <span className="text-muted-foreground">{s.detail}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono",
                      s.percent > 0 ? "text-success" : s.percent < 0 ? "text-destructive" : "",
                    )}
                  >
                    {s.percent > 0 ? "+" : ""}
                    {s.percent.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </details>

          {quote.warnings.length > 0 && (
            <ul className="flex flex-col gap-1">
              {quote.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-text"
                >
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {/* Lo que se le pasa al cliente: UN número, editable. */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Le ofrezco</Label>
              <Input
                type="number"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="h-9 w-44 font-mono"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => persist(false)}
              disabled={saving}
            >
              Guardar
            </Button>
            {onSend && (
              <Button size="sm" onClick={() => persist(true)} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <Send className="mr-2 size-3.5" />
                )}
                Enviar al cliente
              </Button>
            )}
          </div>
          {Number(offer) > quote.offerMax && (
            <p className="text-xs text-warning-text">
              Estás ofreciendo más que el techo sugerido. Se guarda igual, con tu
              nombre.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** El texto que recibe el cliente: un solo número, sin el desglose interno. */
function clientText(q: QuoteResult, offer: number): string {
  const m = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: q.currency,
    maximumFractionDigits: 0,
  });
  return (
    `Por tu ${q.brand} ${q.model} ${q.version} ${q.year} ` +
    `con ${q.km.toLocaleString("es-AR")} km, te lo tomamos en ${m.format(offer)}. ` +
    `Es una cotización orientativa: la confirmamos cuando lo vemos.`
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Select con búsqueda por texto. La guía tiene 142 marcas y algunos modelos
 * pasan las 40 versiones: un select pelado es inusable.
 */
function Combo({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())).slice(0, 60)
    : options.slice(0, 60);

  return (
    <div className="relative">
      <Input
        value={open ? q : value}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

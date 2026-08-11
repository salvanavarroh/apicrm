import { Card } from "@/components/ui/card";
import { formatARS } from "@/lib/format";
import { LEAD_PAYMENT_LABELS, type LeadPaymentMethod } from "@/lib/leads";
import { cn } from "@/lib/utils";

// ============================================================================
// Bloques compartidos de la ficha de lead.
//
// Existen para que las cinco fichas (vendedor, gerente, admin, proveedor de
// datos y superadmin) se vean como el mismo producto. Antes cada una repetía su
// propia pila de Cards planas con un primitivo `Detail` local, y el resultado
// era que la misma información se veía distinta según el rol.
// ============================================================================

/** Título de sección: agrupa bloques en vez de dejarlos como pares planos. */
export function FichaSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-accent" />
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          {title}
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      {children}
    </section>
  );
}

/** Etiqueta + valor. El `0` se preserva: `value || "—"` lo comía. */
export function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm font-medium">{empty ? "—" : value}</span>
    </div>
  );
}

export type LeadBusinessData = {
  vehicle_model: string | null;
  vehicle_version: string | null;
  preferred_color: string | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  declared_payment_method: string | null;
  has_used_car: boolean | null;
  used_car_description: string | null;
  initial_notes: string | null;
  branch_name?: string | null;
  product_type_name?: string | null;
};

/**
 * Bloque "el negocio": vehículo + plata en un solo lugar, con el monto como el
 * segundo elemento más grande de la pantalla después del nombre del cliente.
 *
 * Antes el presupuesto era un `Detail` más dentro de un grid, con el mismo peso
 * visual que "Ciudad" — en un CRM de concesionaria, donde la plata es lo único
 * que define si el negocio existe.
 */
export function LeadBusinessCard({ lead }: { lead: LeadBusinessData }) {
  const paymentLabel = lead.declared_payment_method
    ? LEAD_PAYMENT_LABELS[lead.declared_payment_method as LeadPaymentMethod]
    : null;
  const hasRange = Boolean(lead.budget_min && lead.budget_max);
  const headline = lead.budget_max ?? lead.budget_min;

  return (
    <Card className="relative gap-4 overflow-hidden p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-accent"
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Vehículo de interés
          </span>
          <p className="text-lg font-bold">
            {lead.vehicle_model || "Sin definir"}
          </p>
          <p className="text-sm text-muted-foreground">
            {[lead.vehicle_version, lead.preferred_color]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:text-right">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Presupuesto declarado
          </span>
          <p className="font-mono text-3xl leading-none font-bold tracking-tight tabular-nums">
            {headline ? formatARS(headline) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {[hasRange ? `desde ${formatARS(lead.budget_min)}` : null, paymentLabel]
              .filter(Boolean)
              .join(" · ") || "Sin datos de pago"}
          </p>
        </div>
      </div>

      <div className="h-px bg-border" aria-hidden />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Entrega usado
          </span>
          {lead.has_used_car ? (
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Sí
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {lead.used_car_description || "a tasar"}
              </span>
            </span>
          ) : (
            <span className="text-sm font-medium">No</span>
          )}
        </div>
        <Detail label="Sucursal" value={lead.branch_name} />
        <Detail label="Tipo" value={lead.product_type_name} />
      </div>

      {lead.initial_notes && (
        <>
          <div className="h-px bg-border" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Notas iniciales
            </span>
            <p className="text-sm">{lead.initial_notes}</p>
          </div>
        </>
      )}
    </Card>
  );
}

export const QUOTE_MODALITY_LABELS: Record<string, string> = {
  cash: "Contado",
  financed: "Financiado",
  savings_plan: "Plan de ahorro",
};

/**
 * Estado de vencimiento del presupuesto. `valid_until` se consultaba en varias
 * fichas y no se mostraba en ninguna, y en un mercado con listas de precios
 * mensuales el vencimiento es justamente lo que decide si hay que recotizar.
 */
export function quoteExpiry(
  validUntil: string | null | undefined,
): { label: string; days: number; expired: boolean } | null {
  if (!validUntil) return null;
  const days = Math.ceil(
    (new Date(validUntil).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return { label: "Vencido", days, expired: true };
  if (days === 0) return { label: "Vence hoy", days, expired: false };
  return { label: `Vence en ${days} días`, days, expired: false };
}

/** Chip de vencimiento, con el tono según cuán cerca está. */
export function QuoteExpiryChip({
  validUntil,
}: {
  validUntil: string | null | undefined;
}) {
  const expiry = quoteExpiry(validUntil);
  if (!expiry) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        expiry.expired
          ? "bg-destructive/10 text-destructive"
          : expiry.days <= 7
            ? "bg-warning/15 text-warning-text"
            : "bg-muted text-muted-foreground",
      )}
    >
      {expiry.label}
    </span>
  );
}

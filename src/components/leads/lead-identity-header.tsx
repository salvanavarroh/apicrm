import { Clock, Mail, MapPin, Phone, UserRound } from "lucide-react";

import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { TemperatureBadge } from "@/components/leads/temperature-control";
import {
  fullName,
  type LeadStatus,
  type LeadTemperature,
} from "@/lib/leads";
import { cn } from "@/lib/utils";

// ============================================================================
// Encabezado de identidad de la ficha de lead.
//
// Reemplaza el header "h1 + dos badges + fila de controles" por el mismo
// lenguaje de bloque que ya usa LeadsPageHeader: gradiente de acento, filete
// lateral y chips de estado. Suma dos cosas que faltaban:
//
//   1. La tira de contacto es ACCIONABLE. El teléfono era un <div>: no se podía
//      tocar para llamar, que es literalmente lo primero que hace un vendedor.
//   2. Antigüedad y días sin gestión como chips. Ese dato ya se calculaba para
//      la próxima acción y no se mostraba en ningún lado.
// ============================================================================

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "quoted",
];

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function agoLabel(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return `hace ${Math.round(days / 30)} meses`;
}

function initials(first: string | null, last: string | null): string {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function LeadIdentityHeader({
  firstName,
  lastName,
  status,
  temperature,
  createdAt,
  lastManagedAt,
  lastContactedAt,
  phone,
  email,
  city,
  vehicle,
  assigneeName,
  actions,
  contactEditor,
  className,
}: {
  firstName: string | null;
  lastName: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  createdAt: string;
  /** Última gestión real: nota, tarea, visita, mensaje o cambio de estado. Es lo
   *  que mide "sin gestión" — NO el tiempo en la etapa del pipeline. */
  lastManagedAt?: string | null;
  lastContactedAt?: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  /** Vehículo de interés en una línea, para el subtítulo. */
  vehicle?: string | null;
  /**
   * Vendedor a cargo. Sólo tiene sentido en las fichas de gerente/admin/
   * superadmin: en la del vendedor el lead siempre es suyo.
   */
  assigneeName?: string | null;
  /** Controles de la ficha: WhatsApp, estado, temperatura, iniciar venta. */
  actions?: React.ReactNode;
  /**
   * Editor de teléfono/email. Va en la tira de contacto y no en `actions`
   * porque edita justamente los datos que la tira muestra.
   */
  contactEditor?: React.ReactNode;
  className?: string;
}) {
  const age = daysSince(createdAt);
  const stale = ACTIVE_STATUSES.includes(status)
    ? daysSince(lastManagedAt)
    : null;
  const contacted = daysSince(lastContactedAt);
  const name = fullName(firstName, lastName) || "Sin nombre";
  // El link de WhatsApp necesita el número sin espacios ni guiones.
  const waNumber = phone?.replace(/[^\d+]/g, "") ?? "";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br from-accent/10 via-card to-card",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent to-accent/30"
      />

      <div className="flex flex-col gap-4 p-5 pl-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-13 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-bold text-accent">
              {initials(firstName, lastName)}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
              {vehicle && (
                <p className="text-sm text-muted-foreground">{vehicle}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <LeadStatusBadge status={status} />
                {temperature && <TemperatureBadge temperature={temperature} />}
                {age !== null && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Entró {agoLabel(age)}
                  </span>
                )}
                {stale !== null && stale >= 3 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                      stale >= 7
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/15 text-warning-text",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        stale >= 7 ? "bg-destructive" : "bg-warning",
                      )}
                    />
                    {stale} d sin gestión
                  </span>
                )}
              </div>
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {/* Tira de contacto: cada dato es un target, no un texto inerte. */}
        <div className="flex flex-wrap gap-2">
          {phone ? (
            <a
              href={`tel:${waNumber}`}
              className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium transition-colors hover:border-accent/50"
            >
              <Phone className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{phone}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">
                LLAMAR
              </span>
            </a>
          ) : (
            <ContactPlaceholder icon={Phone} text="Sin teléfono" />
          )}

          {email ? (
            <a
              href={`mailto:${email}`}
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm font-medium transition-colors hover:border-accent/50"
            >
              <Mail className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{email}</span>
            </a>
          ) : (
            <ContactPlaceholder icon={Mail} text="Sin email" />
          )}

          {city && <ContactPlaceholder icon={MapPin} text={city} />}

          {assigneeName !== undefined && (
            <ContactPlaceholder
              icon={UserRound}
              text={assigneeName ?? "Sin asignar"}
              emphasis={!assigneeName}
            />
          )}

          <ContactPlaceholder
            icon={Clock}
            text={
              contacted === null
                ? "Sin contacto registrado"
                : `Último contacto ${agoLabel(contacted)}`
            }
            emphasis={contacted === null}
          />

          {contactEditor}
        </div>
      </div>
    </div>
  );
}

function ContactPlaceholder({
  icon: Icon,
  text,
  emphasis,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm",
        emphasis ? "text-warning-text" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {text}
    </span>
  );
}

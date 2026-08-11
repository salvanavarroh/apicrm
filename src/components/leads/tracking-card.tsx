import {
  ChevronDown,
  Compass,
  ExternalLink,
  Globe2,
  Megaphone,
  Radio,
  Tag,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TrackingData = {
  source?: string | null; // canal/origen del lead: WhatsApp, Instagram, Meta Lead Ads, Landing…
  campaign?: string | null; // campaña comercial asignada (si hay)
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_url: string | null;
  referrer: string | null;
};

/**
 * Card de "Datos de Tracking" para el lead detail. Si no hay nada capturado
 * (por ejemplo: lead cargado a mano por el proveedor de datos), no se rendea.
 */
export function TrackingCard({
  data,
  collapsible = false,
}: {
  data: TrackingData;
  /**
   * Renderiza la card como un `<details>` cerrado. La atribución es plomería de
   * marketing: en la ficha del vendedor no compite con la gestión del lead,
   * pero sigue estando a un clic.
   */
  collapsible?: boolean;
}) {
  const hasUtm =
    data.utm_source ||
    data.utm_medium ||
    data.utm_campaign ||
    data.utm_term ||
    data.utm_content;
  const hasOrigin = data.landing_url || data.referrer;
  const hasChannel = !!data.source || !!data.campaign;
  if (!hasChannel && !hasUtm && !hasOrigin) return null;

  const body = (
    <>
        {hasChannel && (
          <div className="flex flex-col gap-2">
            <SectionLabel
              icon={<Radio className="size-3.5" />}
              text="Canal de origen"
            />
            <div className="flex flex-wrap items-center gap-2">
              {data.source && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-sm font-medium text-foreground">
                  {data.source}
                </span>
              )}
              {data.campaign && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                  <Megaphone className="size-3" />
                  {data.campaign}
                </span>
              )}
            </div>
          </div>
        )}

        {hasUtm && (
          <div className="flex flex-col gap-2">
            <SectionLabel
              icon={<Megaphone className="size-3.5" />}
              text="Campaña"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TrackField label="Source" value={data.utm_source} />
              <TrackField label="Medium" value={data.utm_medium} />
              <TrackField
                label="Campaign"
                value={data.utm_campaign}
                wide
              />
              <TrackField label="Term" value={data.utm_term} />
              <TrackField label="Content" value={data.utm_content} />
            </div>
          </div>
        )}

        {hasOrigin && (
          <div className="flex flex-col gap-2">
            <SectionLabel
              icon={<Globe2 className="size-3.5" />}
              text="Origen"
            />
            <div className="flex flex-col gap-2">
              {data.landing_url && (
                <UrlRow label="Landing" value={data.landing_url} />
              )}
              {data.referrer && (
                <UrlRow label="Referrer" value={data.referrer} />
              )}
            </div>
          </div>
        )}
    </>
  );

  if (collapsible) {
    return (
      <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <Compass className="size-4 text-accent" />
          Origen y atribución
          {data.source && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.source}
            </span>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 px-5 pb-5 text-sm">{body}</div>
      </details>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="size-4 text-accent" />
          Datos de Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">{body}</CardContent>
    </Card>
  );
}

function SectionLabel({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}

function TrackField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">
        {value ? (
          <span className="inline-flex items-center gap-1.5">
            <Tag className="size-3 text-muted-foreground/60" />
            {value}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </p>
    </div>
  );
}

function UrlRow({ label, value }: { label: string; value: string }) {
  const isUrl = /^https?:\/\//i.test(value);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {isUrl ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-start gap-1.5 break-all text-sm text-accent hover:underline"
        >
          <ExternalLink className="mt-0.5 size-3 shrink-0" />
          <span>{value}</span>
        </a>
      ) : (
        <p className="break-all text-sm text-foreground">{value}</p>
      )}
    </div>
  );
}

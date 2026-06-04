import {
  Compass,
  ExternalLink,
  Globe2,
  Megaphone,
  Tag,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TrackingData = {
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
export function TrackingCard({ data }: { data: TrackingData }) {
  const hasUtm =
    data.utm_source ||
    data.utm_medium ||
    data.utm_campaign ||
    data.utm_term ||
    data.utm_content;
  const hasOrigin = data.landing_url || data.referrer;
  if (!hasUtm && !hasOrigin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="size-4 text-accent" />
          Datos de Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {hasUtm && (
          <div className="flex flex-col gap-2">
            <SectionLabel
              icon={<Megaphone className="size-3.5" />}
              text="Campaña"
            />
            <div className="grid grid-cols-2 gap-3">
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
      </CardContent>
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

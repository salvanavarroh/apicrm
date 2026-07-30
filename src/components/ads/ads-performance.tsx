"use client";

import { BarChart3, DollarSign, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getAdsPerformance,
  type AdRow,
  type AdsPerformance,
} from "@/app/(app)/admin/ads/actions";

const PRESETS: { label: string; days: number }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];
const PLATFORMS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "facebook", label: "Meta (FB/IG)" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
];

function money(n: number, currency = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function int(n: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}
function pct(n: number): string {
  return `${(n || 0).toFixed(1)}%`;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  active: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  paused: "bg-amber-100 text-amber-700",
};

export function AdsPerformanceView({ initial }: { initial: AdsPerformance }) {
  const [data, setData] = useState(initial);
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState("");
  const [pending, start] = useTransition();

  function reload(nextDays: number, nextPlatform: string) {
    setDays(nextDays);
    setPlatform(nextPlatform);
    start(async () => {
      const to = ymd(new Date());
      const from = ymd(new Date(Date.now() - nextDays * 24 * 60 * 60 * 1000));
      try {
        const res = await getAdsPerformance({ from, to, platform: nextPlatform });
        setData(res);
      } catch {
        toast.error("No se pudieron cargar las métricas");
      }
    });
  }

  if (!data.connected) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Todavía no hay una cuenta de ads conectada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conectá Meta Ads (y luego TikTok / Google) en Integraciones para ver el
            rendimiento de cada anuncio acá.
          </p>
        </div>
        <Button asChild size="sm">
          <a href="/admin/integraciones?tab=connections">Ir a Integraciones</a>
        </Button>
      </Card>
    );
  }

  const t = data.totals;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => reload(p.days, platform)}
              disabled={pending}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                days === p.days ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={platform}
          onChange={(e) => reload(days, e.target.value)}
          disabled={pending}
          className="rounded-lg border bg-background px-3 py-1.5 text-sm"
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6", pending && "opacity-60")}>
        <KpiCard label="Inversión" value={money(t.spend)} icon={DollarSign} />
        <KpiCard label="Leads" value={int(t.leads)} icon={Users} caption={`${int(t.contacted)} contactados`} />
        <KpiCard label="Ventas" value={int(t.sales)} icon={TrendingUp} />
        <KpiCard label="Facturación" value={money(t.revenue)} icon={DollarSign} />
        <KpiCard
          label="Costo por lead"
          value={t.costPerLead != null ? money(t.costPerLead) : "—"}
          icon={MousePointerClick}
        />
        <KpiCard
          label="ROAS real"
          value={t.realRoas != null ? `${t.realRoas.toFixed(2)}x` : "—"}
          icon={TrendingUp}
          caption="facturación / inversión"
        />
      </div>

      {/* Tabla por anuncio */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Anuncio</th>
                <th className="px-3 py-2.5 text-right font-medium">Inversión</th>
                <th className="px-3 py-2.5 text-right font-medium">Impr.</th>
                <th className="px-3 py-2.5 text-right font-medium">Clics</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="px-3 py-2.5 text-right font-medium">CPC</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Leads</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="px-3 py-2.5 text-right font-medium">Facturación</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Costo/lead</th>
                <th className="px-3 py-2.5 text-right font-medium">ROAS real</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No hay anuncios con datos en este período.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => <AdRowLine key={r.adId} r={r} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AdRowLine({ r }: { r: AdRow }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{r.adName ?? r.adSetName ?? r.adId}</span>
              {r.status && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {r.status.toLowerCase()}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {r.campaignName ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.spend, r.currency)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{int(r.impressions)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{int(r.clicks)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.ctr)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.cpc, r.currency)}</td>
      <td className="border-l px-3 py-2.5 text-right font-medium tabular-nums">{int(r.leads)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{int(r.sales)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.revenue, r.currency)}</td>
      <td className="border-l px-3 py-2.5 text-right tabular-nums">
        {r.costPerLead != null ? money(r.costPerLead, r.currency) : "—"}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-right font-medium tabular-nums",
          r.realRoas != null && r.realRoas >= 1 && "text-emerald-600",
          r.realRoas != null && r.realRoas < 1 && r.spend > 0 && "text-red-600",
        )}
      >
        {r.realRoas != null ? `${r.realRoas.toFixed(2)}x` : "—"}
      </td>
    </tr>
  );
}

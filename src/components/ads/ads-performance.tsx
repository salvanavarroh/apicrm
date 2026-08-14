"use client";

import {
  RefreshCw,
  BarChart3,
  Download,
  Flame,
  Star,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getAdsPerformance,
  type AdRow,
  type AdsPerformance,
  type GroupRow,
  type PreviousTotals,
  type Totals,
} from "@/app/(app)/admin/ads/actions";

const PRESETS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];
// Pestañas de plataforma: "General" = todas juntas, o una sola.
const PLATFORM_TABS = [
  { value: "", label: "General" },
  { value: "facebook", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "tiktok", label: "TikTok" },
];
type StatusFilter = "active" | "paused" | "all";
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Activas" },
  { value: "paused", label: "Pausadas" },
  { value: "all", label: "Todas" },
];
const PLATFORM_COLOR: Record<string, string> = {
  Meta: "#1877F2",
  TikTok: "#111827",
  Google: "#F59E0B",
};
const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Meta",
  instagram: "Meta",
  meta: "Meta",
  metaads: "Meta",
  tiktok: "TikTok",
  google: "Google",
};
/**
 * Compara la plataforma de una fila con la pestaña elegida. "Meta" agrupa
 * facebook, instagram, meta y metaads, que es como vienen de Zernio.
 */
function samePlatform(rowPlatform: string, tab: string): boolean {
  if (!tab) return true;
  return platformLabel(rowPlatform) === platformLabel(tab);
}

function platformLabel(p: string): string {
  return PLATFORM_LABEL[p.toLowerCase()] ?? p;
}
function PlatformBadge({ platform }: { platform: string }) {
  const label = platformLabel(platform);
  const color = PLATFORM_COLOR[label] ?? "#94A3B8";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
const C = { spend: "#6851FC", leads: "#0EA5E9", sales: "#22C55E" };

type GroupMode = "ad" | "adset" | "campaign";
const GROUP_MODES: { value: GroupMode; label: string }[] = [
  { value: "ad", label: "Anuncio" },
  { value: "adset", label: "Adset" },
  { value: "campaign", label: "Campaña" },
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
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Helpers de "hoy" a nivel módulo: aíslan la llamada impura (new Date()/Date.now)
// del cuerpo del componente, que la regla react-hooks/purity no permite.
function todayYmd(): string {
  return ymd(new Date());
}
function daysAgoYmd(d: number): string {
  return ymd(new Date(Date.now() - d * 24 * 60 * 60 * 1000));
}
function dayLabel(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  active: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  paused: "bg-amber-100 text-amber-700",
};

export function AdsPerformanceView({ initial }: { initial: AdsPerformance }) {
  const [data, setData] = useState(initial);
  const [from, setFrom] = useState(initial.range.from);
  const [to, setTo] = useState(initial.range.to);
  const [preset, setPreset] = useState<number | null>(30);
  const [platform, setPlatform] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  // Por default se agrupa por campaña: es la unidad con la que se decide dónde
  // poner la plata. El detalle por anuncio queda a un clic.
  const [groupMode, setGroupMode] = useState<GroupMode>("campaign");
  const [detail, setDetail] = useState<AdRow | null>(null);
  const [pending, start] = useTransition();
  const today = todayYmd();

  // ---------------------------------------------------------------------
  // Filtrado EN CLIENTE.
  //
  // El server trae SIEMPRE todas las plataformas del rango. Antes, tocar la
  // pestaña de plataforma disparaba un refetch completo contra Meta/Google/
  // TikTok: varios segundos de espera para mostrar un subconjunto de datos que
  // ya estaban en memoria. Ahora el único motivo para volver a pedir al server
  // es cambiar el rango de fechas (o el botón de actualizar).
  // ---------------------------------------------------------------------
  const filteredRows = useMemo(() => {
    return data.rows.filter((r) => {
      // 1) plataforma
      if (platform && !samePlatform(r.platform, platform)) return false;
      // 2) estado del anuncio/campaña
      const s = (r.status ?? "").toUpperCase();
      if (statusFilter === "active" && s !== "ACTIVE") return false;
      if (statusFilter === "paused" && !s.includes("PAUSED")) return false;
      return true;
    });
  }, [data.rows, platform, statusFilter]);

  // Filas sin NADA en el período (ni inversión, ni clics, ni leads) sólo suman
  // ruido: son campañas que existen en la cuenta pero no corrieron en el rango.
  const displayRows = useMemo(() => {
    const grouped = aggregateRows(filteredRows, groupMode);
    return grouped.filter(
      (r) => r.spend > 0 || r.clicks > 0 || r.leads > 0 || r.impressions > 0,
    );
  }, [filteredRows, groupMode]);
  const hiddenEmpty = useMemo(
    () => aggregateRows(filteredRows, groupMode).length - displayRows.length,
    [filteredRows, groupMode, displayRows.length],
  );
  // Los charts (recharts) se montan solo en el cliente para evitar problemas de
  // hidratación (miden el ancho del contenedor con ResizeObserver).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * Vuelve a pedir al server. Sólo se llama al cambiar el rango de fechas o
   * desde el botón "Actualizar": la plataforma y el estado se filtran sobre lo
   * que ya está en memoria.
   */
  function reload(next?: { from?: string; to?: string }) {
    const f = next?.from ?? from;
    const tt = next?.to ?? to;
    setFrom(f);
    setTo(tt);
    start(async () => {
      try {
        // Sin `platform`: se traen todas y se filtra en el cliente.
        setData(await getAdsPerformance({ from: f, to: tt }));
      } catch {
        toast.error("No se pudieron cargar las métricas");
      }
    });
  }
  // Presets (últimos N días): fijan el rango y quedan resaltados.
  function applyPreset(d: number) {
    setPreset(d);
    reload({ from: daysAgoYmd(d), to: todayYmd() });
  }
  // Rango manual: al tocar una fecha se desactiva el preset.
  function onFrom(v: string) {
    if (!v) return;
    setPreset(null);
    reload({ from: v });
  }
  function onTo(v: string) {
    if (!v) return;
    setPreset(null);
    reload({ to: v });
  }

  if (!data.connected) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Todavía no hay una cuenta de ads conectada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conectá Meta Ads, TikTok Ads o Google Ads en Integraciones para ver el
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
  const p = data.previous;
  const insights = computeInsights(filteredRows, t, p);

  return (
    <div className={cn("flex flex-col gap-4", pending && "opacity-70")}>
      {/* Plataforma (pestañas) + "actualizado hace X" */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          {PLATFORM_TABS.map((x) => (
            <button
              key={x.value}
              // Filtro en cliente: no vuelve a pegarle a las plataformas.
              onClick={() => setPlatform(x.value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                platform === x.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {mounted && (
            <span
              className="text-xs text-muted-foreground"
              title={new Date(data.generatedAt).toLocaleString("es-AR")}
            >
              Actualizado {relTime(data.generatedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => reload()}
            disabled={pending}
          >
            <RefreshCw className={cn("mr-2 size-3.5", pending && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Rango de fechas (presets + manual) + estado */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5">
          {PRESETS.map((x) => (
            <button
              key={x.days}
              onClick={() => applyPreset(x.days)}
              disabled={pending}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                preset === x.days
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => onFrom(e.target.value)}
            disabled={pending}
            className="bg-transparent tabular-nums outline-none"
            aria-label="Desde"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => onTo(e.target.value)}
            disabled={pending}
            className="bg-transparent tabular-nums outline-none"
            aria-label="Hasta"
          />
        </div>
        <div className="ml-auto inline-flex rounded-lg border p-0.5">
          {STATUS_TABS.map((x) => (
            <button
              key={x.value}
              onClick={() => setStatusFilter(x.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                statusFilter === x.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Inversión" value={money(t.spend)} delta={delta(t.spend, p.spend)} mood="neutral" />
        <Kpi
          label="Leads"
          value={int(t.metaLeads)}
          delta={delta(t.metaLeads, p.metaLeads)}
          spark={data.daily.map((d) => d.leads)}
        />
        <Kpi
          label="Costo / lead"
          value={t.costPerLead != null ? money(t.costPerLead) : "—"}
          delta={
            t.costPerLead != null && p.costPerLead != null
              ? delta(t.costPerLead, p.costPerLead)
              : null
          }
          mood="down"
        />
        <Kpi
          label="Ventas"
          value={int(t.sales)}
          delta={delta(t.sales, p.sales)}
          spark={data.daily.map((d) => d.sales)}
        />
        <Kpi
          label="Costo / venta"
          value={t.costPerSale != null ? money(t.costPerSale) : "—"}
          mood="down"
        />
        <Kpi
          label="ROAS real"
          value={t.realRoas != null ? `${t.realRoas.toFixed(2)}x` : "—"}
          delta={
            t.realRoas != null && p.realRoas != null ? delta(t.realRoas, p.realRoas) : null
          }
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Leads y ventas por día" className="lg:col-span-2">
          {mounted && (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.daily} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.leads} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.leads} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => dayLabel(String(d))}
                  tick={{ fontSize: 11 }}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip
                  labelFormatter={(d) => dayLabel(String(d))}
                  formatter={(v, n) => [int(Number(v)), n === "leads" ? "Leads" : "Ventas"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="leads" stroke={C.leads} fill="url(#gL)" strokeWidth={2} />
                <Area type="monotone" dataKey="sales" stroke={C.sales} fill="none" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Inversión por plataforma">
          {mounted &&
            (data.byPlatform.some((x) => x.spend > 0) ? (
              <PlatformDonut data={data.byPlatform} />
            ) : (
              <EmptyChart />
            ))}
        </ChartCard>
      </div>

      {/* Embudo real + heatmap de horarios */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Embudo real">
          <Funnel funnel={data.funnel} />
          <AttributionCoverage a={data.attribution} />
        </ChartCard>
        <ChartCard title="Cuándo entran los leads (por día y hora, AR)">
          <Heatmap grid={data.leadsByHour} />
        </ChartCard>
      </div>

      {/* Insights accionables — justo antes de la tabla */}
      {insights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((it, i) => (
            <InsightCard key={i} {...it} />
          ))}
        </div>
      )}

      {/* Tabla con agrupamiento + export */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <span className="text-sm font-medium">
            {groupMode === "ad"
              ? "Anuncios"
              : groupMode === "adset"
                ? "Adsets"
                : "Campañas"}{" "}
            <span className="font-normal text-muted-foreground">(clic para ver detalle)</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border p-0.5">
              {GROUP_MODES.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGroupMode(g.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    groupMode === g.value
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {hiddenEmpty > 0 && (
              <span className="text-xs text-muted-foreground">
                {hiddenEmpty} sin actividad en el período
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(displayRows, data.range, groupMode)}
              disabled={displayRows.length === 0}
            >
              <Download className="mr-1 size-4" /> CSV
            </Button>
          </div>
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">
                  {groupMode === "adset" ? "Adset" : groupMode === "campaign" ? "Campaña" : "Anuncio"}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Inversión</th>
                <th className="px-3 py-2.5 text-right font-medium">Clics</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Leads</th>
                <th
                  className="px-3 py-2.5 text-right font-medium"
                  title="Ventas del CRM sobre los leads reportados por la plataforma"
                >
                  Conv.
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Costo/lead</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo/venta</th>
                <th className="px-3 py-2.5 text-right font-medium">ROAS real</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No hay anuncios con datos en este período.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => {
                  const h = rowHealth(r);
                  const conv = r.metaLeads > 0 ? (r.sales / r.metaLeads) * 100 : null;
                  return (
                    <tr
                      key={r.adId}
                      onClick={() => setDetail(r)}
                      className={cn(
                        "cursor-pointer border-b last:border-0 hover:bg-muted/40",
                        h === "bad" && "bg-destructive/5",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <PlatformBadge platform={r.platform} />
                          <span className="max-w-[220px] truncate font-medium">
                            {r.adName ?? r.adSetName ?? r.adId}
                          </span>
                          {r.status && (
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground")}>
                              {r.status.toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{r.campaignName ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.spend, r.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{int(r.clicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.ctr)}</td>
                      <td className="border-l px-3 py-2.5 text-right font-medium tabular-nums">{int(r.metaLeads)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {conv != null ? pct(conv) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{int(r.sales)}</td>
                      <td className="border-l px-3 py-2.5 text-right tabular-nums">
                        {r.costPerLead != null ? money(r.costPerLead, r.currency) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.costPerSale != null ? money(r.costPerSale, r.currency) : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", roasTone(r))}>
                        {r.realRoas != null ? `${r.realRoas.toFixed(2)}x` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span
                          title={HEALTH_LABEL[h]}
                          className={cn(
                            "inline-block size-2 rounded-full",
                            h === "good" && "bg-success",
                            h === "watch" && "bg-warning",
                            h === "bad" && "bg-destructive",
                            h === "idle" && "bg-muted-foreground/40",
                          )}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && <AdDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// --- helpers de UI ----------------------------------------------------------

function delta(cur: number, prev: number): { pctText: string; up: boolean } | null {
  if (!prev) return cur > 0 ? { pctText: "nuevo", up: true } : null;
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 0.5) return null;
  return { pctText: `${d > 0 ? "+" : ""}${d.toFixed(0)}%`, up: d >= 0 };
}
function roasTone(r: AdRow): string {
  if (r.realRoas == null) return "";
  if (r.realRoas >= 1) return "text-emerald-600";
  if (r.spend > 0) return "text-red-600";
  return "";
}

type Insight = { tone: "crit" | "warn" | "good"; label: string; text: ReactNode };

const HEALTH_LABEL: Record<"good" | "watch" | "bad" | "idle", string> = {
  good: "Genera ventas",
  watch: "Trae leads, sin ventas todavía",
  bad: "Gasta sin generar leads",
  idle: "Sin inversión en el período",
};

// Salud del anuncio para el semáforo de la tabla.
function rowHealth(r: AdRow): "good" | "watch" | "bad" | "idle" {
  if (r.spend <= 0) return "idle";
  if (r.metaLeads === 0) return "bad"; // plata quemada
  if (r.sales > 0) return "good";
  return "watch";
}

// Insights accionables a partir de las filas + totales del período.
function computeInsights(rows: AdRow[], t: Totals, p: PreviousTotals): Insight[] {
  const out: Insight[] = [];
  const burned = rows.filter((r) => r.spend > 0 && r.metaLeads === 0);
  if (burned.length) {
    const spent = burned.reduce((s, r) => s + r.spend, 0);
    out.push({
      tone: "crit",
      label: "Plata quemada",
      text: (
        <>
          <b>{burned.length} anuncio{burned.length > 1 ? "s" : ""}</b> gastaron{" "}
          <b>{money(spent)}</b> sin generar leads.
        </>
      ),
    });
  }
  if (t.costPerLead != null && p.costPerLead != null && p.costPerLead > 0) {
    const d = ((t.costPerLead - p.costPerLead) / p.costPerLead) * 100;
    if (d >= 15) {
      out.push({
        tone: "warn",
        label: "Costo por lead",
        text: (
          <>
            El costo por lead subió <b>{d.toFixed(0)}%</b> ({money(p.costPerLead)} →{" "}
            {money(t.costPerLead)}).
          </>
        ),
      });
    }
  }
  const best = rows
    .filter((r) => r.sales > 0 && r.realRoas != null)
    .sort((a, b) => (b.realRoas ?? 0) - (a.realRoas ?? 0))[0];
  if (best) {
    out.push({
      tone: "good",
      label: "Mejor retorno",
      text: (
        <>
          <b>{best.campaignName ?? best.adName ?? "Un anuncio"}</b>:{" "}
          {(best.realRoas ?? 0).toFixed(1)}× ROAS
          {best.costPerLead != null ? ` · ${money(best.costPerLead)}/lead` : ""}.
        </>
      ),
    });
  }
  return out.slice(0, 3);
}

function InsightCard({ tone, label, text }: Insight) {
  const Icon = tone === "crit" ? Flame : tone === "warn" ? TrendingUp : Star;
  const bar =
    tone === "crit"
      ? "border-l-destructive"
      : tone === "warn"
        ? "border-l-warning"
        : "border-l-success";
  const ic =
    tone === "crit"
      ? "bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "bg-warning/15 text-warning"
        : "bg-success/10 text-success";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-l-[3px] bg-card p-3.5 shadow-sm", bar)}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ic)}>
        <Icon className="size-4" />
      </span>
      <div className="text-[13px]">
        <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5">{text}</div>
      </div>
    </div>
  );
}

// Donut de inversión por plataforma: total al centro + leyenda con montos y %.
function PlatformDonut({ data }: { data: GroupRow[] }) {
  const items = data.filter((x) => x.spend > 0).sort((a, b) => b.spend - a.spend);
  const total = items.reduce((s, x) => s + x.spend, 0);
  return (
    <div className="flex h-full flex-wrap items-center justify-center gap-6 py-2">
      <div className="relative size-[184px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="spend"
              nameKey="key"
              innerRadius={60}
              outerRadius={86}
              paddingAngle={2}
              cornerRadius={4}
              strokeWidth={0}
            >
              {items.map((x) => (
                <Cell key={x.key} fill={PLATFORM_COLOR[x.key] ?? "#94A3B8"} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums">{money(total)}</span>
          <span className="text-[11px] text-muted-foreground">total</span>
        </div>
      </div>
      <div className="flex min-w-[150px] flex-col gap-2.5">
        {items.map((x) => {
          const pctv = total > 0 ? Math.round((x.spend / total) * 100) : 0;
          return (
            <div key={x.key} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-sm" style={{ background: PLATFORM_COLOR[x.key] ?? "#94A3B8" }} />
              <span>{x.key}</span>
              <span className="ml-auto font-semibold tabular-nums">{money(x.spend)}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pctv}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttributionCoverage({ a }: { a: { attributed: number; total: number } }) {
  const pctv = a.total > 0 ? Math.round((a.attributed / a.total) * 100) : 0;
  return (
    <div className="mt-3 border-t border-dashed pt-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>
          <b className="text-foreground">{pctv}%</b> de {int(a.total)} leads atribuidos a un anuncio
        </span>
        <span>{100 - pctv}% sin atribuir</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="h-full bg-success" style={{ width: `${pctv}%` }} />
        <span className="h-full bg-muted-foreground/40" style={{ width: `${100 - pctv}%` }} />
      </div>
      <p className="mt-1.5">El resto entra por click-to-WhatsApp, que Zernio no reenvía con atribución.</p>
    </div>
  );
}

// Heatmap 7×franjas de 2h: cuándo entran los leads (para pauta y turnos).
function Heatmap({ grid }: { grid: number[][] }) {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const buckets = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  const val = (d: number, h: number) => (grid[d]?.[h] ?? 0) + (grid[d]?.[h + 1] ?? 0);
  let max = 1;
  const peak = { d: 0, h: 6, v: -1 };
  for (let d = 0; d < 7; d++) {
    for (const h of buckets) {
      const v = val(d, h);
      if (v > max) max = v;
      if (v > peak.v) {
        peak.d = d;
        peak.h = h;
        peak.v = v;
      }
    }
  }
  return (
    <div className="py-1">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `34px repeat(${buckets.length}, 1fr)` }}>
        <div />
        {buckets.map((h) => (
          <div key={h} className="text-center text-[9.5px] text-muted-foreground">{h}h</div>
        ))}
        {days.map((dl, d) => (
          <Fragment key={dl}>
            <div className="self-center text-[10.5px] text-muted-foreground">{dl}</div>
            {buckets.map((h) => {
              const v = val(d, h);
              return (
                <div
                  key={h}
                  className="rounded-sm"
                  style={{
                    aspectRatio: "1.7 / 1",
                    background: "var(--color-accent)",
                    opacity: 0.1 + (v / max) * 0.9,
                  }}
                  title={`${dl} ${h}–${h + 2}h · ${v} lead${v === 1 ? "" : "s"}`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      {peak.v > 0 && (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Pico: <b className="text-foreground">{days[peak.d]} {peak.h}–{peak.h + 2}h</b> · útil para
          programar pauta y turnos de vendedores.
        </p>
      )}
    </div>
  );
}

// Agrupa las filas por adset o campaña (o las deja tal cual en modo "ad").
// Métricas de conteo/monto se suman; las tasas (CTR, CPC, ROAS) se recalculan
// desde los agregados — ROAS de plataforma ponderado por inversión.
function aggregateRows(rows: AdRow[], mode: GroupMode): AdRow[] {
  if (mode === "ad") return rows;
  const map = new Map<string, AdRow>();
  const wRoas = new Map<string, number>();
  for (const r of rows) {
    const key =
      mode === "adset" ? (r.adSetName ?? "Sin adset") : (r.campaignName ?? "Sin campaña");
    let g = map.get(key);
    if (!g) {
      g = {
        adId: `${mode}:${key}`,
        platform: r.platform,
        campaignName: mode === "adset" ? r.campaignName : null,
        adSetName: mode === "adset" ? r.adSetName : null,
        adName: key,
        status: null,
        currency: r.currency,
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        conversions: 0,
        roas: 0,
        metaLeads: 0,
        leads: 0,
        contacted: 0,
        interested: 0,
        quoted: 0,
        sales: 0,
        revenue: 0,
        costPerLead: null,
        costPerSale: null,
        realRoas: null,
      };
      map.set(key, g);
      wRoas.set(key, 0);
    }
    g.spend += r.spend;
    g.impressions += r.impressions;
    g.clicks += r.clicks;
    g.conversions += r.conversions;
    g.metaLeads += r.metaLeads;
    g.leads += r.leads;
    g.contacted += r.contacted;
    g.interested += r.interested;
    g.quoted += r.quoted;
    g.sales += r.sales;
    g.revenue += r.revenue;
    wRoas.set(key, (wRoas.get(key) ?? 0) + r.roas * r.spend);
  }
  for (const [key, g] of map) {
    g.ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
    g.cpc = g.clicks > 0 ? g.spend / g.clicks : 0;
    g.roas = g.spend > 0 ? (wRoas.get(key) ?? 0) / g.spend : 0;
    g.costPerLead = g.spend > 0 && g.metaLeads > 0 ? g.spend / g.metaLeads : null;
    g.costPerSale = g.spend > 0 && g.sales > 0 ? g.spend / g.sales : null;
    g.realRoas = g.spend > 0 ? g.revenue / g.spend : null;
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend || b.leads - a.leads);
}

// Exporta las filas visibles a CSV (Excel es-AR: separador ';', BOM UTF-8,
// números con punto decimal). Descarga en el navegador sin tocar el server.
function exportCsv(rows: AdRow[], range: { from: string; to: string }, mode: GroupMode): void {
  const headers = [
    mode === "adset" ? "Adset" : mode === "campaign" ? "Campaña" : "Anuncio",
    "Adset",
    "Campaña",
    "Plataforma",
    "Estado",
    "Inversión",
    "Impresiones",
    "Clics",
    "CTR %",
    "CPC",
    "ROAS plataforma",
    "Leads (Meta)",
    "Leads (CRM)",
    "Contactados",
    "Interesados",
    "Presupuestados",
    "Ventas",
    "Facturación",
    "Costo/lead",
    "Costo/venta",
    "ROAS real",
  ];
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const n = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "");
  const nn = (v: number | null) => (v == null ? "" : n(v));
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push(
      [
        q(r.adName ?? r.adId),
        q(r.adSetName ?? ""),
        q(r.campaignName ?? ""),
        q(platformLabel(r.platform)),
        q(r.status ?? ""),
        n(r.spend),
        n(r.impressions),
        n(r.clicks),
        n(r.ctr),
        n(r.cpc),
        n(r.roas),
        n(r.metaLeads),
        n(r.leads),
        n(r.contacted),
        n(r.interested),
        n(r.quoted),
        n(r.sales),
        n(r.revenue),
        nn(r.costPerLead),
        nn(r.costPerSale),
        nn(r.realRoas),
      ].join(";"),
    );
  }
  const csv = String.fromCharCode(0xfeff) + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ads-${range.from}-a-${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// mood: cómo colorear el delta. "up" = subir es bueno (leads, ROAS); "down" =
// bajar es bueno (costo por lead); "neutral" = informativo (inversión).
type DeltaMood = "up" | "down" | "neutral";

function Kpi({
  label,
  value,
  delta,
  mood = "up",
  spark,
}: {
  label: string;
  value: string;
  delta?: { pctText: string; up: boolean } | null;
  mood?: DeltaMood;
  spark?: number[];
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className="text-2xl font-bold leading-none tracking-tight tabular-nums">{value}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold",
              deltaTextTone(delta.up, mood),
            )}
          >
            {delta.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta.pctText}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.some((v) => v > 0) && <Sparkline data={spark} up={delta?.up ?? true} mood={mood} />}
      </div>
    </Card>
  );
}

function Sparkline({ data, up, mood }: { data: number[]; up: boolean; mood: DeltaMood }) {
  const w = 62;
  const h = 20;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = max - min || 1;
  const n = Math.max(1, data.length - 1);
  const pts = data
    .map((v, i) => `${((i / n) * w).toFixed(1)},${(h - 1 - ((v - min) / range) * (h - 2)).toFixed(1)}`)
    .join(" ");
  const good = mood === "neutral" ? null : mood === "down" ? !up : up;
  const stroke = good == null ? "var(--color-muted-foreground)" : good ? "#16a34a" : "#dc2626";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0">
      <polyline points={pts} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Color de texto del delta según "mood" (up=subir bueno, down=bajar bueno, neutral=informativo).
function deltaTextTone(up: boolean, mood: DeltaMood): string {
  if (mood === "neutral") return "text-muted-foreground";
  const good = mood === "down" ? !up : up;
  return good ? "text-emerald-600" : "text-red-600";
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="text-sm font-medium">{title}</div>
      <div className="min-h-[220px]">{children}</div>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      Sin datos en este período.
    </div>
  );
}

const FUNNEL_STAGES: { key: keyof AdsPerformance["funnel"]; label: string; color: string }[] = [
  { key: "leads", label: "Leads", color: "var(--color-accent)" },
  { key: "contacted", label: "Contactados", color: "var(--color-accent)" },
  { key: "interested", label: "Interesados", color: "var(--color-accent)" },
  { key: "quoted", label: "Presupuestados", color: "var(--color-accent)" },
  { key: "sales", label: "Ventas", color: "var(--color-accent)" },
];

function Funnel({ funnel }: { funnel: AdsPerformance["funnel"] }) {
  const top = funnel.leads || 1;
  return (
    <div className="flex flex-col gap-2 py-2">
      {FUNNEL_STAGES.map((s) => {
        const v = funnel[s.key];
        const w = Math.max(4, (v / top) * 100);
        const conv = funnel.leads ? (v / funnel.leads) * 100 : 0;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className="w-24 shrink-0 text-xs text-muted-foreground">{s.label}</div>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
              <div
                className="flex h-full items-center rounded-md px-2 text-[11px] font-semibold text-white"
                style={{ width: `${w}%`, backgroundColor: s.color }}
              >
                {int(v)}
              </div>
            </div>
            <div className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {conv.toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdDetail({ row, onClose }: { row: AdRow; onClose: () => void }) {
  const stats: { label: string; value: string }[] = [
    { label: "Inversión", value: money(row.spend, row.currency) },
    { label: "Impresiones", value: int(row.impressions) },
    { label: "Clics", value: int(row.clicks) },
    { label: "CTR", value: pct(row.ctr) },
    { label: "CPC", value: money(row.cpc, row.currency) },
    { label: "ROAS plataforma", value: `${row.roas.toFixed(2)}x` },
    { label: "Leads", value: int(row.leads) },
    { label: "Contactados", value: int(row.contacted) },
    { label: "Interesados", value: int(row.interested) },
    { label: "Presupuestados", value: int(row.quoted) },
    { label: "Ventas", value: int(row.sales) },
    { label: "Facturación", value: money(row.revenue, row.currency) },
    { label: "Costo/lead", value: row.costPerLead != null ? money(row.costPerLead, row.currency) : "—" },
    { label: "Costo/venta", value: row.costPerSale != null ? money(row.costPerSale, row.currency) : "—" },
    { label: "ROAS real", value: row.realRoas != null ? `${row.realRoas.toFixed(2)}x` : "—" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5">
              <PlatformBadge platform={row.platform} />
              {row.status && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground")}>
                  {row.status.toLowerCase()}
                </span>
              )}
            </div>
            <div className="truncate font-semibold">{row.adName ?? row.adSetName ?? row.adId}</div>
            <div className="text-xs text-muted-foreground">{row.campaignName ?? "—"}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-2.5">
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <div className="mb-2 text-sm font-medium">Embudo de este anuncio</div>
          <Funnel
            funnel={{
              leads: row.leads,
              contacted: row.contacted,
              interested: row.interested,
              quoted: row.quoted,
              sales: row.sales,
            }}
          />
        </div>
      </div>
    </div>
  );
}

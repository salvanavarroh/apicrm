"use client";

import {
  BarChart3,
  DollarSign,
  Download,
  MousePointerClick,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
} from "@/app/(app)/admin/ads/actions";

const PRESETS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];
const PLATFORMS = [
  { value: "", label: "Todas" },
  { value: "facebook", label: "Meta (FB/IG)" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
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
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("ad");
  const [detail, setDetail] = useState<AdRow | null>(null);
  const [pending, start] = useTransition();

  // Filas de la tabla según el agrupamiento (anuncio / adset / campaña).
  const displayRows = useMemo(
    () => aggregateRows(data.rows, groupMode),
    [data.rows, groupMode],
  );
  // Los charts (recharts) se montan solo en el cliente para evitar problemas de
  // hidratación (miden el ancho del contenedor con ResizeObserver).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function reload(nextDays: number, nextPlatform: string) {
    setDays(nextDays);
    setPlatform(nextPlatform);
    start(async () => {
      const to = ymd(new Date());
      const from = ymd(new Date(Date.now() - nextDays * 24 * 60 * 60 * 1000));
      try {
        setData(await getAdsPerformance({ from, to, platform: nextPlatform }));
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

  return (
    <div className={cn("flex flex-col gap-4", pending && "opacity-70")}>
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          {PRESETS.map((x) => (
            <button
              key={x.days}
              onClick={() => reload(x.days, platform)}
              disabled={pending}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                days === x.days ? "bg-primary text-primary-foreground" : "hover:bg-muted",
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
          <select
            value={platform}
            onChange={(e) => reload(days, e.target.value)}
            disabled={pending}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm"
          >
            {PLATFORMS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs con deltas vs. período anterior */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Inversión"
          value={money(t.spend)}
          icon={DollarSign}
          delta={delta(t.spend, p.spend)}
          mood="neutral"
        />
        <Kpi label="Leads" value={int(t.leads)} icon={Users} delta={delta(t.leads, p.leads)} />
        <Kpi label="Ventas" value={int(t.sales)} icon={TrendingUp} delta={delta(t.sales, p.sales)} />
        <Kpi label="Facturación" value={money(t.revenue)} icon={DollarSign} delta={delta(t.revenue, p.revenue)} />
        <Kpi
          label="Costo por lead"
          value={t.costPerLead != null ? money(t.costPerLead) : "—"}
          icon={MousePointerClick}
          delta={
            t.costPerLead != null && p.costPerLead != null
              ? delta(t.costPerLead, p.costPerLead)
              : null
          }
          mood="down"
        />
        <Kpi
          label="ROAS real"
          value={t.realRoas != null ? `${t.realRoas.toFixed(2)}x` : "—"}
          icon={TrendingUp}
          caption="facturación / inversión"
          delta={
            t.realRoas != null && p.realRoas != null ? delta(t.realRoas, p.realRoas) : null
          }
        />
      </div>

      {/* Comparación con período anterior */}
      <PeriodComparison t={t} p={p} days={days} />

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
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.byPlatform}
                    dataKey="spend"
                    nameKey="key"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {data.byPlatform.map((x) => (
                      <Cell key={x.key} fill={PLATFORM_COLOR[x.key] ?? "#94A3B8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            ))}
        </ChartCard>
      </div>

      {/* Embudo + comparación por campaña */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Embudo (leads con atribución de ad)">
          <Funnel funnel={data.funnel} />
        </ChartCard>

        <ChartCard title="Comparación por campaña" className="lg:col-span-2">
          {mounted &&
            (data.byCampaign.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byCampaign} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    tickFormatter={(s) => {
                      const str = String(s);
                      return str.length > 12 ? str.slice(0, 11) + "…" : str;
                    }}
                  />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} width={38} tickFormatter={(v) => money(Number(v))} />
                  <YAxis yAxisId="r" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} width={26} />
                  <Tooltip
                    formatter={(v, n) =>
                      n === "spend" ? [money(Number(v)), "Inversión"] : [int(Number(v)), "Leads"]
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar yAxisId="l" dataKey="spend" fill={C.spend} radius={[4, 4, 0, 0]} maxBarSize={34} />
                  <Bar yAxisId="r" dataKey="leads" fill={C.leads} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            ))}
        </ChartCard>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">
                  {groupMode === "adset" ? "Adset" : groupMode === "campaign" ? "Campaña" : "Anuncio"}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Inversión</th>
                <th className="px-3 py-2.5 text-right font-medium">Clics</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Leads</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="px-3 py-2.5 text-right font-medium">Facturación</th>
                <th className="border-l px-3 py-2.5 text-right font-medium">Costo/lead</th>
                <th className="px-3 py-2.5 text-right font-medium">ROAS real</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No hay anuncios con datos en este período.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <tr
                    key={r.adId}
                    onClick={() => setDetail(r)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
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
                    <td className="border-l px-3 py-2.5 text-right font-medium tabular-nums">{int(r.leads)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{int(r.sales)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.revenue, r.currency)}</td>
                    <td className="border-l px-3 py-2.5 text-right tabular-nums">
                      {r.costPerLead != null ? money(r.costPerLead, r.currency) : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", roasTone(r))}>
                      {r.realRoas != null ? `${r.realRoas.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                ))
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
    g.costPerLead = g.spend > 0 && g.leads > 0 ? g.spend / g.leads : null;
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
    "Leads",
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

// Comparación del período actual vs. el anterior (mismo largo, inmediatamente
// previo): valor actual, valor anterior y variación coloreada por "mood".
function PeriodComparison({
  t,
  p,
  days,
}: {
  t: AdsPerformance["totals"];
  p: AdsPerformance["previous"];
  days: number;
}) {
  const rows: {
    label: string;
    cur: number | null;
    prev: number | null;
    fmt: (n: number) => string;
    mood: DeltaMood;
  }[] = [
    { label: "Inversión", cur: t.spend, prev: p.spend, fmt: (n) => money(n), mood: "neutral" },
    { label: "Leads", cur: t.leads, prev: p.leads, fmt: int, mood: "up" },
    { label: "Ventas", cur: t.sales, prev: p.sales, fmt: int, mood: "up" },
    { label: "Facturación", cur: t.revenue, prev: p.revenue, fmt: (n) => money(n), mood: "up" },
    { label: "Clics", cur: t.clicks, prev: p.clicks, fmt: int, mood: "up" },
    {
      label: "Costo por lead",
      cur: t.costPerLead,
      prev: p.costPerLead,
      fmt: (n) => money(n),
      mood: "down",
    },
    {
      label: "ROAS real",
      cur: t.realRoas,
      prev: p.realRoas,
      fmt: (n) => `${n.toFixed(2)}x`,
      mood: "up",
    },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b px-4 py-2.5 text-sm font-medium">
        Comparación con período anterior{" "}
        <span className="font-normal text-muted-foreground">
          (últimos {days} días vs. {days} anteriores)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Métrica</th>
              <th className="px-4 py-2 text-right font-medium">Actual</th>
              <th className="px-4 py-2 text-right font-medium">Anterior</th>
              <th className="px-4 py-2 text-right font-medium">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d =
                r.cur != null && r.prev != null ? delta(r.cur, r.prev) : null;
              return (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{r.label}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {r.cur != null ? r.fmt(r.cur) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {r.prev != null ? r.fmt(r.prev) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                          deltaTone(d.up, r.mood),
                        )}
                      >
                        {d.up ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        )}
                        {d.pctText}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// mood: cómo colorear el delta. "up" = subir es bueno (leads, ROAS); "down" =
// bajar es bueno (costo por lead); "neutral" = informativo (inversión).
type DeltaMood = "up" | "down" | "neutral";

function deltaTone(up: boolean, mood: DeltaMood): string {
  if (mood === "neutral") return "bg-muted text-muted-foreground";
  const good = mood === "down" ? !up : up;
  return good ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
}

function Kpi({
  label,
  value,
  caption,
  icon: Icon,
  delta,
  mood = "up",
}: {
  label: string;
  value: string;
  caption?: string;
  icon: typeof DollarSign;
  delta?: { pctText: string; up: boolean } | null;
  mood?: DeltaMood;
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-4 text-accent" />
          {label}
        </div>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              deltaTone(delta.up, mood),
            )}
          >
            {delta.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {delta.pctText}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold leading-none tracking-tight">{value}</p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </Card>
  );
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
  { key: "leads", label: "Leads", color: "#0EA5E9" },
  { key: "contacted", label: "Contactados", color: "#6366F1" },
  { key: "interested", label: "Interesados", color: "#8B5CF6" },
  { key: "quoted", label: "Presupuestados", color: "#A855F7" },
  { key: "sales", label: "Ventas", color: "#22C55E" },
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

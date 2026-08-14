// ============================================================================
// Loaders de los reportes del catálogo.
//
// Todos comparten la misma forma de salida (`ReportData`) para que la pantalla
// sea una sola: KPIs + series + tabla. Lo que cambia de un reporte a otro son
// las consultas y qué se pone en cada bloque.
//
// El scope lo pone la RLS: se usa el cliente del usuario, así un gerente ve su
// gerencia y un admin toda la concesionaria sin que estos loaders lo sepan.
// ============================================================================

import { channelLabel, NO_CAMPAIGN_KEY } from "@/lib/campaign-origins";
import { fetchPaged } from "@/lib/leads-fetch";
import { fullName, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export type ReportKpi = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type SeriesPoint = { label: string; value: number; value2?: number };

export type ReportTable = {
  title: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
};

export type ReportData = {
  kpis: ReportKpi[];
  /** Serie temporal principal (barras/área). */
  series?: { title: string; unit?: string; points: SeriesPoint[] };
  /** Distribución (torta / barras horizontales). */
  breakdown?: { title: string; points: SeriesPoint[] };
  tables: ReportTable[];
  /** true si se llegó al tope de filas y los números son sobre una muestra. */
  capped?: boolean;
};

export type ReportFilters = {
  from: string;
  to: string;
  branchId?: string;
  vendorId?: string;
  productTypeId?: string;
  channel?: string;
};

const ACTIVE: LeadStatus[] = ["new", "contacted", "interested", "quoted"];

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);
const pct = (n: number) => `${Math.round((n || 0) * 100)}%`;
const int = (n: number) => new Intl.NumberFormat("es-AR").format(n || 0);

function isoBounds(f: ReportFilters) {
  return {
    fromIso: new Date(`${f.from}T00:00:00`).toISOString(),
    toIso: new Date(`${f.to}T23:59:59.999`).toISOString(),
  };
}

/** Agrupa por mes "YYYY-MM" y devuelve puntos ordenados. */
function byMonth(
  items: { date: string; value: number }[],
): SeriesPoint[] {
  const agg = new Map<string, number>();
  for (const it of items) {
    const key = it.date.slice(0, 7);
    agg.set(key, (agg.get(key) ?? 0) + it.value);
  }
  return [...agg.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const [y, m] = k.split("-");
      return { label: `${m}/${y.slice(2)}`, value: v };
    });
}

// ---------------------------------------------------------------------------
// Reporte de ventas
// ---------------------------------------------------------------------------
export async function loadVentasReport(
  companyId: string,
  f: ReportFilters,
): Promise<ReportData> {
  const supabase = await createClient();
  const { fromIso, toIso } = isoBounds(f);

  let q = supabase
    .from("sales")
    .select(
      `id, status, final_price, started_at, resolved_at, vendor_id,
       vendor:profiles!vendor_id (first_name, last_name),
       lead:leads (branch_id, vehicle_model, branches:branch_id (name))`,
    )
    .eq("company_id", companyId)
    .gte("started_at", fromIso)
    .lte("started_at", toIso);
  if (f.vendorId) q = q.eq("vendor_id", f.vendorId);
  const { data } = await q;

  type Row = {
    id: string;
    status: string;
    final_price: number;
    started_at: string;
    vendor_id: string | null;
    vendor: { first_name: string | null; last_name: string | null } | null;
    lead: {
      branch_id: string | null;
      vehicle_model: string | null;
      branches: { name: string } | null;
    } | null;
  };
  let rows = (data ?? []) as unknown as Row[];
  if (f.branchId) rows = rows.filter((r) => r.lead?.branch_id === f.branchId);

  const accepted = rows.filter((r) => r.status === "accepted");
  const revenue = accepted.reduce((a, r) => a + Number(r.final_price), 0);
  const rejected = rows.filter((r) => r.status === "rejected").length;

  // Por vendedor
  const perVendor = new Map<string, { name: string; n: number; rev: number }>();
  for (const r of accepted) {
    const key = r.vendor_id ?? "—";
    const cur = perVendor.get(key) ?? {
      name: r.vendor ? fullName(r.vendor.first_name, r.vendor.last_name) : "—",
      n: 0,
      rev: 0,
    };
    cur.n += 1;
    cur.rev += Number(r.final_price);
    perVendor.set(key, cur);
  }

  // Por modelo
  const perModel = new Map<string, { n: number; rev: number }>();
  for (const r of accepted) {
    const key = r.lead?.vehicle_model || "Sin modelo";
    const cur = perModel.get(key) ?? { n: 0, rev: 0 };
    cur.n += 1;
    cur.rev += Number(r.final_price);
    perModel.set(key, cur);
  }

  return {
    kpis: [
      { label: "Ventas aprobadas", value: int(accepted.length) },
      { label: "Facturación", value: money(revenue) },
      {
        label: "Ticket promedio",
        value: accepted.length ? money(revenue / accepted.length) : "—",
      },
      {
        label: "Rechazadas",
        value: int(rejected),
        tone: rejected > 0 ? "warning" : "default",
        hint: rows.length ? pct(rejected / rows.length) + " del total" : undefined,
      },
    ],
    series: {
      title: "Facturación por mes",
      points: byMonth(
        accepted.map((r) => ({
          date: r.started_at,
          value: Number(r.final_price),
        })),
      ),
    },
    breakdown: {
      title: "Ventas por modelo",
      points: [...perModel.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 8)
        .map(([k, v]) => ({ label: k, value: v.n })),
    },
    tables: [
      {
        title: "Por vendedor",
        columns: [
          { key: "vendedor", label: "Vendedor" },
          { key: "ventas", label: "Ventas", align: "right" },
          { key: "facturacion", label: "Facturación", align: "right" },
          { key: "ticket", label: "Ticket prom.", align: "right" },
        ],
        rows: [...perVendor.values()]
          .sort((a, b) => b.rev - a.rev)
          .map((v) => ({
            vendedor: v.name,
            ventas: v.n,
            facturacion: money(v.rev),
            ticket: v.n ? money(v.rev / v.n) : "—",
          })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reporte de leads
// ---------------------------------------------------------------------------
export async function loadLeadsReport(
  companyId: string,
  f: ReportFilters,
): Promise<ReportData> {
  const supabase = await createClient();
  const { fromIso, toIso } = isoBounds(f);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, origin")
    .eq("company_id", companyId);
  const origin = new Map((campaigns ?? []).map((c) => [c.id, c.origin]));

  type L = {
    id: string;
    status: LeadStatus;
    created_at: string;
    campaign_id: string | null;
    branch_id: string | null;
    product_type_id: string | null;
    last_contacted_at: string | null;
    assigned_at: string | null;
  };
  const { rows: all, capped } = await fetchPaged<L>((withCount) => {
    let q = supabase
      .from("leads")
      .select(
        `id, status, created_at, campaign_id, branch_id, product_type_id,
         last_contacted_at, assigned_at`,
        withCount ? { count: "exact" } : {},
      )
      .eq("company_id", companyId)
      .is("archived_at", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (f.branchId) q = q.eq("branch_id", f.branchId);
    if (f.productTypeId) q = q.eq("product_type_id", f.productTypeId);
    return q.order("created_at", { ascending: false });
  });

  const chan = (l: L) =>
    l.campaign_id ? (origin.get(l.campaign_id) ?? NO_CAMPAIGN_KEY) : NO_CAMPAIGN_KEY;
  const leads = f.channel ? all.filter((l) => chan(l) === f.channel) : all;

  const contacted = leads.filter((l) => l.last_contacted_at).length;
  const won = leads.filter((l) => ["accepted", "closed"].includes(l.status)).length;
  const active = leads.filter((l) => ACTIVE.includes(l.status)).length;

  // Tiempo hasta el primer contacto (horas), sobre los que sí se contactaron.
  const responseHours = leads
    .filter((l) => l.last_contacted_at)
    .map((l) => {
      const start = new Date(l.assigned_at ?? l.created_at).getTime();
      return (new Date(l.last_contacted_at!).getTime() - start) / 3_600_000;
    })
    .filter((h) => h >= 0);
  const avgResponse = responseHours.length
    ? Math.round(
        (responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10,
      ) / 10
    : null;

  const byChannel = new Map<string, { leads: number; won: number }>();
  for (const l of leads) {
    const k = chan(l);
    const cur = byChannel.get(k) ?? { leads: 0, won: 0 };
    cur.leads += 1;
    if (["accepted", "closed"].includes(l.status)) cur.won += 1;
    byChannel.set(k, cur);
  }

  return {
    capped,
    kpis: [
      { label: "Leads del período", value: int(leads.length) },
      {
        label: "Contactados",
        value: pct(leads.length ? contacted / leads.length : 0),
        hint: `${int(contacted)} de ${int(leads.length)}`,
      },
      {
        label: "Conversión a venta",
        value: pct(leads.length ? won / leads.length : 0),
        hint: `${int(won)} ganados`,
        tone: won > 0 ? "success" : "default",
      },
      {
        label: "1er contacto",
        value: avgResponse !== null ? `${avgResponse} h` : "s/d",
        hint: "Promedio desde la asignación",
        tone: avgResponse !== null && avgResponse > 24 ? "danger" : "default",
      },
    ],
    series: {
      title: "Leads por mes",
      points: byMonth(leads.map((l) => ({ date: l.created_at, value: 1 }))),
    },
    breakdown: {
      title: "Origen de los leads",
      points: [...byChannel.entries()]
        .sort((a, b) => b[1].leads - a[1].leads)
        .map(([k, v]) => ({ label: channelLabel(k), value: v.leads })),
    },
    tables: [
      {
        title: "Por canal",
        columns: [
          { key: "canal", label: "Canal" },
          { key: "leads", label: "Leads", align: "right" },
          { key: "ganados", label: "Ganados", align: "right" },
          { key: "conversion", label: "Conversión", align: "right" },
        ],
        rows: [...byChannel.entries()]
          .sort((a, b) => b[1].leads - a[1].leads)
          .map(([k, v]) => ({
            canal: channelLabel(k),
            leads: v.leads,
            ganados: v.won,
            conversion: pct(v.leads ? v.won / v.leads : 0),
          })),
      },
      {
        title: "Estado actual de esos leads",
        columns: [
          { key: "estado", label: "Estado" },
          { key: "cantidad", label: "Cantidad", align: "right" },
        ],
        rows: [
          { estado: "Activos en pipeline", cantidad: active },
          { estado: "Ganados", cantidad: won },
          {
            estado: "No interesados",
            cantidad: leads.filter((l) => l.status === "not_interested").length,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reporte trimestral: el período elegido vs el inmediato anterior
// ---------------------------------------------------------------------------
export async function loadTrimestralReport(
  companyId: string,
  f: ReportFilters,
): Promise<ReportData> {
  const supabase = await createClient();
  const { fromIso, toIso } = isoBounds(f);
  const spanMs =
    new Date(toIso).getTime() - new Date(fromIso).getTime() || 86_400_000;
  const prevTo = new Date(new Date(fromIso).getTime() - 1).toISOString();
  const prevFrom = new Date(new Date(fromIso).getTime() - spanMs).toISOString();

  async function slice(a: string, b: string) {
    const [{ count: leads }, { data: sales }] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("archived_at", null)
        .gte("created_at", a)
        .lte("created_at", b),
      supabase
        .from("sales")
        .select("final_price, status, started_at")
        .eq("company_id", companyId)
        .gte("started_at", a)
        .lte("started_at", b),
    ]);
    const ok = (sales ?? []).filter((s) => s.status === "accepted");
    return {
      leads: leads ?? 0,
      sales: ok.length,
      revenue: ok.reduce((x, s) => x + Number(s.final_price), 0),
      raw: ok.map((s) => ({ date: s.started_at, value: Number(s.final_price) })),
    };
  }

  const [cur, prev] = await Promise.all([
    slice(fromIso, toIso),
    slice(prevFrom, prevTo),
  ]);

  const delta = (a: number, b: number) =>
    b === 0 ? (a > 0 ? "nuevo" : "—") : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`;

  return {
    kpis: [
      {
        label: "Leads",
        value: int(cur.leads),
        hint: `${delta(cur.leads, prev.leads)} vs período anterior`,
        tone: cur.leads >= prev.leads ? "success" : "warning",
      },
      {
        label: "Ventas",
        value: int(cur.sales),
        hint: `${delta(cur.sales, prev.sales)} vs período anterior`,
        tone: cur.sales >= prev.sales ? "success" : "warning",
      },
      {
        label: "Facturación",
        value: money(cur.revenue),
        hint: `${delta(cur.revenue, prev.revenue)} vs período anterior`,
        tone: cur.revenue >= prev.revenue ? "success" : "warning",
      },
      {
        label: "Conversión",
        value: pct(cur.leads ? cur.sales / cur.leads : 0),
        hint: `antes ${pct(prev.leads ? prev.sales / prev.leads : 0)}`,
      },
    ],
    series: { title: "Facturación por mes", points: byMonth(cur.raw) },
    tables: [
      {
        title: "Comparativa",
        columns: [
          { key: "metrica", label: "Métrica" },
          { key: "actual", label: "Período actual", align: "right" },
          { key: "anterior", label: "Anterior", align: "right" },
          { key: "var", label: "Variación", align: "right" },
        ],
        rows: [
          {
            metrica: "Leads",
            actual: int(cur.leads),
            anterior: int(prev.leads),
            var: delta(cur.leads, prev.leads),
          },
          {
            metrica: "Ventas",
            actual: int(cur.sales),
            anterior: int(prev.sales),
            var: delta(cur.sales, prev.sales),
          },
          {
            metrica: "Facturación",
            actual: money(cur.revenue),
            anterior: money(prev.revenue),
            var: delta(cur.revenue, prev.revenue),
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Productividad por vendedor
// ---------------------------------------------------------------------------
export async function loadVendedoresReport(
  companyId: string,
  f: ReportFilters,
): Promise<ReportData> {
  const supabase = await createClient();
  const { fromIso, toIso } = isoBounds(f);

  const [{ data: vendors }, { data: sales }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, status")
      .eq("company_id", companyId)
      .eq("role", "sales")
      .neq("status", "deleted"),
    supabase
      .from("sales")
      .select("vendor_id, status, final_price")
      .eq("company_id", companyId)
      .gte("started_at", fromIso)
      .lte("started_at", toIso),
  ]);

  type L = {
    assigned_user_id: string | null;
    status: LeadStatus;
    last_contacted_at: string | null;
    created_at: string;
    assigned_at: string | null;
  };
  const { rows: leads, capped } = await fetchPaged<L>((withCount) => {
    let q = supabase
      .from("leads")
      .select(
        "assigned_user_id, status, last_contacted_at, created_at, assigned_at",
        withCount ? { count: "exact" } : {},
      )
      .eq("company_id", companyId)
      .is("archived_at", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (f.branchId) q = q.eq("branch_id", f.branchId);
    return q.order("created_at", { ascending: false });
  });

  const rows = (vendors ?? []).map((v) => {
    const mine = leads.filter((l) => l.assigned_user_id === v.id);
    const contacted = mine.filter((l) => l.last_contacted_at);
    const mySales = (sales ?? []).filter(
      (s) => s.vendor_id === v.id && s.status === "accepted",
    );
    const hours = contacted
      .map(
        (l) =>
          (new Date(l.last_contacted_at!).getTime() -
            new Date(l.assigned_at ?? l.created_at).getTime()) /
          3_600_000,
      )
      .filter((h) => h >= 0);
    const avg = hours.length
      ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10
      : null;
    return {
      name: fullName(v.first_name, v.last_name),
      leads: mine.length,
      contacted: contacted.length,
      sales: mySales.length,
      revenue: mySales.reduce((a, s) => a + Number(s.final_price), 0),
      conv: mine.length ? mySales.length / mine.length : 0,
      avg,
    };
  });

  const totalSales = rows.reduce((a, r) => a + r.sales, 0);
  const withData = rows.filter((r) => r.avg !== null);
  const teamAvg = withData.length
    ? Math.round(
        (withData.reduce((a, r) => a + (r.avg ?? 0), 0) / withData.length) * 10,
      ) / 10
    : null;

  return {
    capped,
    kpis: [
      { label: "Vendedores", value: int(rows.length) },
      { label: "Ventas del equipo", value: int(totalSales) },
      {
        label: "1er contacto (equipo)",
        value: teamAvg !== null ? `${teamAvg} h` : "s/d",
        tone: teamAvg !== null && teamAvg > 24 ? "danger" : "default",
      },
      {
        label: "Sin ventas",
        value: int(rows.filter((r) => r.sales === 0).length),
        tone: rows.some((r) => r.sales === 0) ? "warning" : "default",
      },
    ],
    breakdown: {
      title: "Ventas por vendedor",
      points: rows
        .filter((r) => r.sales > 0)
        .sort((a, b) => b.sales - a.sales)
        .map((r) => ({ label: r.name, value: r.sales })),
    },
    tables: [
      {
        title: "Detalle del equipo",
        columns: [
          { key: "vendedor", label: "Vendedor" },
          { key: "leads", label: "Leads", align: "right" },
          { key: "contactados", label: "Contactados", align: "right" },
          { key: "ventas", label: "Ventas", align: "right" },
          { key: "conversion", label: "Conversión", align: "right" },
          { key: "respuesta", label: "1er contacto", align: "right" },
          { key: "facturacion", label: "Facturación", align: "right" },
        ],
        rows: rows
          .sort((a, b) => b.sales - a.sales || b.leads - a.leads)
          .map((r) => ({
            vendedor: r.name,
            leads: r.leads,
            contactados: r.contacted,
            ventas: r.sales,
            conversion: pct(r.conv),
            respuesta: r.avg !== null ? `${r.avg} h` : "—",
            facturacion: money(r.revenue),
          })),
      },
    ],
  };
}

export async function loadReport(
  id: string,
  companyId: string,
  f: ReportFilters,
): Promise<ReportData | null> {
  switch (id) {
    case "ventas":
      return loadVentasReport(companyId, f);
    case "leads":
      return loadLeadsReport(companyId, f);
    case "trimestral":
      return loadTrimestralReport(companyId, f);
    case "vendedores":
      return loadVendedoresReport(companyId, f);
    default:
      return null;
  }
}

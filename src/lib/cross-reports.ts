import { createAdminClient } from "@/lib/supabase/admin";
import { fullName } from "@/lib/leads";
import type { Database } from "@/types/database";

// Etiquetas de canal (mismo set que el diálogo de campañas, replicado acá para
// no importar un componente client en código server).
type CampaignOrigin = Database["public"]["Enums"]["campaign_origin"];
export const CAMPAIGN_ORIGIN_LABELS: Record<CampaignOrigin, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  showroom: "Mostrador",
  referral: "Referido",
  web: "Web",
  email: "Email",
  other: "Otros",
};

const NO_CAMPAIGN_KEY = "none";
const RISK_INACTIVE_DAYS = 14;

export type CompanyRankRow = {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["company_status"];
  leads: number;
  conversion: number; // 0..1
  salesCount: number;
  revenue: number;
  avgTicket: number;
};

export type AccountHealthRow = {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["company_status"];
  lastActivityDays: number | null; // null = nunca hubo actividad
  overduePayments: number;
  atRisk: boolean;
  reasons: string[];
};

export type VendorRankRow = {
  id: string;
  name: string;
  companyName: string;
  salesCount: number;
  revenue: number;
};

export type ChannelRow = {
  key: string;
  label: string;
  leads: number;
  share: number; // 0..1
};

export type CrossReports = {
  companies: CompanyRankRow[];
  health: AccountHealthRow[];
  vendors: VendorRankRow[];
  channels: ChannelRow[];
  totals: { companies: number; leads: number; sales: number; revenue: number };
};

export async function loadCrossReports(): Promise<CrossReports> {
  const admin = createAdminClient();

  const [companiesRes, leadsRes, campaignsRes, salesRes, profilesRes, paymentsRes] =
    await Promise.all([
      admin.from("companies").select("id, name, status"),
      admin
        .from("leads")
        .select("id, company_id, status, created_at, campaign_id"),
      admin.from("campaigns").select("id, origin"),
      admin
        .from("sales")
        .select("company_id, vendor_id, final_price, status, started_at"),
      admin
        .from("profiles")
        .select("id, first_name, last_name, company_id, role")
        .neq("status", "deleted"),
      admin.from("subscription_payments").select("company_id, status"),
    ]);

  const companies = companiesRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const sales = salesRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  const acceptedSales = sales.filter((s) => s.status === "accepted");
  const campaignOrigin = new Map(campaigns.map((c) => [c.id, c.origin]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const now = Date.now();

  // --- 1. Ranking de empresas -------------------------------------------------
  const byCompany = companies.map((c) => {
    const cLeads = leads.filter((l) => l.company_id === c.id);
    const cAccepted = acceptedSales.filter((s) => s.company_id === c.id);
    const revenue = cAccepted.reduce((a, s) => a + Number(s.final_price), 0);
    const salesCount = cAccepted.length;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      leads: cLeads.length,
      conversion: cLeads.length > 0 ? salesCount / cLeads.length : 0,
      salesCount,
      revenue,
      avgTicket: salesCount > 0 ? revenue / salesCount : 0,
    } satisfies CompanyRankRow;
  });
  const companiesRanked = [...byCompany].sort((a, b) => b.revenue - a.revenue);

  // --- 2. Salud de cuenta -----------------------------------------------------
  const lastLeadAt = new Map<string, number>();
  for (const l of leads) {
    const t = new Date(l.created_at).getTime();
    if (t > (lastLeadAt.get(l.company_id) ?? 0)) lastLeadAt.set(l.company_id, t);
  }
  const lastSaleAt = new Map<string, number>();
  for (const s of sales) {
    if (!s.company_id) continue;
    const t = new Date(s.started_at).getTime();
    if (t > (lastSaleAt.get(s.company_id) ?? 0)) lastSaleAt.set(s.company_id, t);
  }
  const overdueByCompany = new Map<string, number>();
  for (const p of payments) {
    if (p.status === "overdue") {
      overdueByCompany.set(
        p.company_id,
        (overdueByCompany.get(p.company_id) ?? 0) + 1,
      );
    }
  }

  const health = companies.map((c) => {
    const last = Math.max(lastLeadAt.get(c.id) ?? 0, lastSaleAt.get(c.id) ?? 0);
    const lastActivityDays =
      last > 0 ? Math.floor((now - last) / (1000 * 60 * 60 * 24)) : null;
    const overduePayments = overdueByCompany.get(c.id) ?? 0;

    const reasons: string[] = [];
    if (lastActivityDays === null) reasons.push("Sin actividad registrada");
    else if (lastActivityDays > RISK_INACTIVE_DAYS)
      reasons.push(`Inactiva hace ${lastActivityDays} días`);
    if (overduePayments > 0)
      reasons.push(
        `${overduePayments} pago(s) vencido(s)`,
      );

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      lastActivityDays,
      overduePayments,
      atRisk: reasons.length > 0,
      reasons,
    } satisfies AccountHealthRow;
  });
  // En riesgo primero; dentro, las más inactivas arriba.
  health.sort((a, b) => {
    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
    return (b.lastActivityDays ?? 1e9) - (a.lastActivityDays ?? 1e9);
  });

  // --- 3. Ranking global de vendedores ---------------------------------------
  const vendorAgg = new Map<string, { salesCount: number; revenue: number }>();
  for (const s of acceptedSales) {
    if (!s.vendor_id) continue;
    const cur = vendorAgg.get(s.vendor_id) ?? { salesCount: 0, revenue: 0 };
    cur.salesCount += 1;
    cur.revenue += Number(s.final_price);
    vendorAgg.set(s.vendor_id, cur);
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const vendors: VendorRankRow[] = [...vendorAgg.entries()]
    .map(([vendorId, agg]) => {
      const p = profileById.get(vendorId);
      return {
        id: vendorId,
        name: p ? fullName(p.first_name, p.last_name) : "—",
        companyName: p?.company_id
          ? (companyName.get(p.company_id) ?? "—")
          : "—",
        salesCount: agg.salesCount,
        revenue: agg.revenue,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // --- 4. Distribución por canal ---------------------------------------------
  const channelAgg = new Map<string, number>();
  for (const l of leads) {
    const key = l.campaign_id
      ? (campaignOrigin.get(l.campaign_id) ?? NO_CAMPAIGN_KEY)
      : NO_CAMPAIGN_KEY;
    channelAgg.set(key, (channelAgg.get(key) ?? 0) + 1);
  }
  const totalLeads = leads.length;
  const channels: ChannelRow[] = [...channelAgg.entries()]
    .map(([key, count]) => ({
      key,
      label:
        key === NO_CAMPAIGN_KEY
          ? "Sin campaña / Directo"
          : CAMPAIGN_ORIGIN_LABELS[key as CampaignOrigin],
      leads: count,
      share: totalLeads > 0 ? count / totalLeads : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  return {
    companies: companiesRanked,
    health,
    vendors,
    channels,
    totals: {
      companies: companies.length,
      leads: totalLeads,
      sales: acceptedSales.length,
      revenue: acceptedSales.reduce((a, s) => a + Number(s.final_price), 0),
    },
  };
}

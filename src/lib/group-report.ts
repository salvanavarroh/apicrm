// ============================================================================
// Consolidado del grupo: una fila por marca, más el total.
//
// Estas consultas NO pasan por RLS. RLS scopea al usuario a UNA marca (la
// activa), que es justamente lo que hace que el resto de la app no haya tenido
// que cambiar; para mirar el grupo entero hace falta salir de ese scope. Se usa
// service_role acotado a mano a las marcas del grupo, con el `groupId` que ya
// viene del profile del usuario: mismo patrón que el informe de ads.
//
// El costo por lead necesita la inversión de Meta/Google/TikTok, que se pide en
// vivo a Zernio y son varias llamadas HTTP por marca. Por eso vive en una
// función aparte que la pantalla dispara a pedido: si el consolidado la
// esperara, el grupo de 10 marcas tardaría 10 veces lo que tarda una.
// ============================================================================

import { listAds } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

export type BrandMetrics = {
  companyId: string;
  name: string;
  leads: number;
  contacted: number;
  quoted: number;
  sales: number;
  revenue: number;
  /** Ventas / leads del período, en %. */
  conversion: number;
  branches: number;
  vendors: number;
};

export type GroupReport = {
  from: string;
  to: string;
  brands: BrandMetrics[];
  totals: {
    leads: number;
    contacted: number;
    quoted: number;
    sales: number;
    revenue: number;
    conversion: number;
    branches: number;
    vendors: number;
  };
};

// Estados que cuentan como "avanzó" (mismo criterio que el informe de ads).
const CONTACTED = [
  "contacted",
  "interested",
  "quoted",
  "evaluating",
  "accepted",
  "closed",
] as const;
const QUOTED = ["quoted", "evaluating", "accepted", "closed"] as const;

export async function loadGroupReport(
  groupId: string,
  range: { from: string; to: string },
): Promise<GroupReport> {
  const admin = createAdminClient();

  const { data: companies } = await admin
    .from("companies")
    .select("id, name")
    .eq("group_id", groupId)
    .order("name");

  const list = companies ?? [];
  if (list.length === 0) {
    return {
      from: range.from,
      to: range.to,
      brands: [],
      totals: {
        leads: 0,
        contacted: 0,
        quoted: 0,
        sales: 0,
        revenue: 0,
        conversion: 0,
        branches: 0,
        vendors: 0,
      },
    };
  }

  const fromIso = `${range.from}T00:00:00`;
  const toIso = `${range.to}T23:59:59`;

  // Una tanda de conteos por marca. Se usan count exact + head: contar sobre el
  // array topa en 1000 filas y subestima en cuanto la marca tiene volumen.
  const brands = await Promise.all(
    list.map(async (c): Promise<BrandMetrics> => {
      function leadBase() {
        return admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.id)
          .is("merged_into_id", null)
          .is("archived_at", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso);
      }

      const [
        leadsRes,
        contactedRes,
        quotedRes,
        salesRows,
        branchesRes,
        vendorsRes,
      ] = await Promise.all([
        leadBase(),
        leadBase().in("status", CONTACTED),
        leadBase().in("status", QUOTED),
        admin
          .from("sales")
          .select("id, final_price")
          .eq("company_id", c.id)
          .eq("status", "accepted")
          .gte("started_at", fromIso)
          .lte("started_at", toIso),
        admin
          .from("branches")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.id)
          .eq("status", "active"),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.id)
          .eq("role", "sales")
          .eq("status", "active"),
      ]);

      const leads = leadsRes.count ?? 0;
      const sales = (salesRows.data ?? []).length;
      const revenue = (salesRows.data ?? []).reduce(
        (n, s) => n + Number(s.final_price ?? 0),
        0,
      );

      return {
        companyId: c.id,
        name: c.name,
        leads,
        contacted: contactedRes.count ?? 0,
        quoted: quotedRes.count ?? 0,
        sales,
        revenue,
        conversion: leads > 0 ? (sales / leads) * 100 : 0,
        branches: branchesRes.count ?? 0,
        vendors: vendorsRes.count ?? 0,
      };
    }),
  );

  const sum = (pick: (b: BrandMetrics) => number) =>
    brands.reduce((n, b) => n + pick(b), 0);
  const totalLeads = sum((b) => b.leads);
  const totalSales = sum((b) => b.sales);

  return {
    from: range.from,
    to: range.to,
    brands,
    totals: {
      leads: totalLeads,
      contacted: sum((b) => b.contacted),
      quoted: sum((b) => b.quoted),
      sales: totalSales,
      revenue: sum((b) => b.revenue),
      conversion: totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0,
      branches: sum((b) => b.branches),
      vendors: sum((b) => b.vendors),
    },
  };
}

export type BrandSpend = {
  companyId: string;
  spend: number;
  /** Inversión / leads del CRM en el período. */
  costPerLead: number | null;
  /** Alguna cuenta tenía más anuncios de los que se pudieron traer. */
  truncated: boolean;
};

/**
 * Inversión de ads por marca. Se pide a Zernio, así que es la parte lenta: la
 * pantalla la trae a pedido y no al cargar.
 *
 * Tope de páginas más bajo que el informe por anuncio (que necesita cada anuncio
 * para atribuir leads): acá sólo hace falta el total invertido, y si se topa se
 * avisa en vez de mostrar un número corto en silencio.
 */
const SPEND_MAX_PAGES = 12;

export async function loadGroupSpend(
  groupId: string,
  range: { from: string; to: string },
): Promise<BrandSpend[]> {
  const admin = createAdminClient();

  const { data: channels } = await admin
    .from("messaging_channels")
    .select("company_id, zernio_account_id")
    .in("platform", ["metaads", "tiktok", "google"])
    .eq("status", "active")
    .in(
      "company_id",
      ((await admin.from("companies").select("id").eq("group_id", groupId)).data ?? []).map(
        (c) => c.id,
      ),
    );

  const byCompany = new Map<string, string[]>();
  for (const ch of channels ?? []) {
    if (!ch.zernio_account_id) continue;
    const arr = byCompany.get(ch.company_id) ?? [];
    arr.push(ch.zernio_account_id);
    byCompany.set(ch.company_id, arr);
  }

  return Promise.all(
    [...byCompany.entries()].map(async ([companyId, accountIds]) => {
      let spend = 0;
      let truncated = false;
      await Promise.all(
        accountIds.map(async (accountId) => {
          try {
            const first = await listAds({
              accountId,
              fromDate: range.from,
              toDate: range.to,
              limit: 100,
              page: 1,
            });
            const add = (ads: { metrics?: { spend?: unknown } }[]) => {
              for (const a of ads) {
                const n = Number(a.metrics?.spend);
                if (Number.isFinite(n)) spend += n;
              }
            };
            add(first.ads ?? []);
            const total = first.pagination?.pages ?? 1;
            if (total > SPEND_MAX_PAGES) truncated = true;
            const pages = Math.min(total, SPEND_MAX_PAGES);
            const rest = await Promise.all(
              Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
                listAds({
                  accountId,
                  fromDate: range.from,
                  toDate: range.to,
                  limit: 100,
                  page: i + 2,
                }).catch(() => null),
              ),
            );
            for (const r of rest) {
              if (r === null) truncated = true;
              else add(r.ads ?? []);
            }
          } catch {
            truncated = true;
          }
        }),
      );

      const { count } = await admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("merged_into_id", null)
        .is("archived_at", null)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      const leads = count ?? 0;

      return {
        companyId,
        spend,
        costPerLead: spend > 0 && leads > 0 ? spend / leads : null,
        truncated,
      };
    }),
  );
}

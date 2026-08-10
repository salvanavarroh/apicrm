import type { Database } from "@/types/database";

// ============================================================================
// Catálogo de planes de suscripción.
//
// Vive en código a propósito: cambiar el precio de lista es editar este archivo
// y desplegar, sin migración ni tocar datos de las cuentas existentes.
//
// IMPORTANTE — el precio de lista es de REFERENCIA. Lo que se factura a cada
// concesionaria es `companies.monthly_price`, que puede diferir (descuentos,
// cuentas legacy, acuerdos particulares). El plan dice "en qué está"; el
// monthly_price dice "cuánto paga".
//
// El precio está en USD porque así se definió comercialmente. `monthly_price`,
// en cambio, hoy se muestra con `formatARS`: mientras esa diferencia exista, el
// plan NO autocompleta el importe a facturar (ver PlanSelect).
// ============================================================================

export type CompanyPlan = Database["public"]["Enums"]["company_plan"];

export type PlanDefinition = {
  key: CompanyPlan;
  label: string;
  /** Precio de lista mensual en USD. `null` = lo define el SuperAdmin. */
  priceUsd: number | null;
  description: string;
  /** Si es false no se ofrece en altas nuevas (queda para cuentas viejas). */
  available: boolean;
};

export const COMPANY_PLANS: PlanDefinition[] = [
  {
    key: "estandar",
    label: "Estándar",
    priceUsd: 150,
    description:
      "Plan de lista: leads, pipeline, ventas, presupuestos, reportes e Inbox de WhatsApp. Sin límite de usuarios.",
    available: true,
  },
  {
    key: "personalizado",
    label: "Personalizado",
    priceUsd: null,
    description:
      "Acuerdo particular. El importe a facturar se carga a mano en esta pantalla.",
    available: true,
  },
  {
    key: "inicial",
    label: "Inicial (legacy)",
    priceUsd: 90,
    description:
      "Precio del piloto. Se mantiene para las cuentas que ya lo tenían; no se ofrece en altas nuevas.",
    available: false,
  },
];

const BY_KEY = new Map(COMPANY_PLANS.map((p) => [p.key, p]));

export function planDefinition(
  plan: CompanyPlan | null | undefined,
): PlanDefinition | null {
  if (!plan) return null;
  return BY_KEY.get(plan) ?? null;
}

export function planLabel(plan: CompanyPlan | null | undefined): string {
  return planDefinition(plan)?.label ?? "Sin plan";
}

/** "USD 150/mes" o "A definir" para el plan personalizado. */
export function planPriceLabel(plan: CompanyPlan | null | undefined): string {
  const def = planDefinition(plan);
  if (!def) return "—";
  if (def.priceUsd === null) return "A definir";
  return `USD ${def.priceUsd}/mes`;
}

/** Planes que se pueden elegir en un alta nueva. */
export function selectablePlans(
  current?: CompanyPlan | null,
): PlanDefinition[] {
  // Si la cuenta ya está en un plan discontinuado, se sigue mostrando para no
  // forzar un cambio de precio al guardar cualquier otro campo.
  return COMPANY_PLANS.filter((p) => p.available || p.key === current);
}

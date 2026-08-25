// ============================================================================
// Carga de la cápsula de contexto: cómo el asistente "entiende al usuario".
//
// Se arma EN EL SERVIDOR, en cada request, de forma determinista. No la escribe
// el modelo, no viene del browser y no se puede falsificar. Son ~150 tokens y
// resuelven la mitad de la calidad del asistente:
//
//   · Respuestas en la ruta correcta. A un vendedor le decís "entrá a Mis
//     leads", no "/admin/leads" — una pantalla que no puede abrir.
//   · Negativas que explican. "Aprobar la venta lo hace tu gerente, Laura."
//   · Nada de features que no tiene. Si la empresa no tiene Sheets conectado, no
//     se explica cómo usarlo: se dice que no está activo y quién lo activa.
//
// Todas las consultas van con el cliente del USUARIO: si la RLS no lo deja ver
// algo, la cápsula tampoco lo sabe.
//
// El TEXTO de la cápsula y sus tipos viven en `capsule.ts`, que es puro y
// testeable. Acá sólo está el IO.
// ============================================================================

import type { Profile } from "@/lib/auth";
import {
  renderCapsule,
  scopeKeyOf,
  type AssistantContext,
  type CapsuleInput,
  type FeatureKey,
} from "@/lib/assistant/capsule";
import { effectiveRole } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { CompanyPlanEnum } from "@/types/assistant-db";

export type { AssistantContext, FeatureKey } from "@/lib/assistant/capsule";
export { renderCapsule } from "@/lib/assistant/capsule";

function fullNameOf(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Usuario";
}

/**
 * Arma la cápsula.
 *
 * Las consultas van todas en paralelo a propósito: son siete `head:true` de
 * ~15 ms y en serie se comerían medio presupuesto de latencia.
 */
export async function loadAssistantContext(
  profile: Profile,
  route: string | null,
): Promise<AssistantContext> {
  const supabase = await createClient();
  const role = effectiveRole(profile);
  const companyId = profile.company_id;

  const [
    company,
    branch,
    productTypes,
    manager,
    channels,
    bot,
    sheets,
    forms,
    valuation,
  ] = await Promise.all([
    companyId
      ? supabase
          .from("companies")
          .select("name, plan")
          .eq("id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profile.branch_id
      ? supabase
          .from("branches")
          .select("name")
          .eq("id", profile.branch_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("user_product_types")
      .select("product_types(name)")
      .eq("user_id", profile.id),
    profile.manager_id
      ? supabase
          .from("profiles")
          .select("first_name, last_name, role")
          .eq("id", profile.manager_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from("messaging_channels")
          .select("platform", { count: "exact" })
          .eq("status", "active")
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from("bot_configs")
          .select("mode, enabled")
          .eq("enabled", true)
          .limit(1)
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from("sheet_sources")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
      : Promise.resolve({ count: 0 }),
    companyId
      ? supabase
          .from("lead_capture_forms")
          .select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
    companyId
      ? supabase
          .from("valuation_settings")
          .select("company_id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
  ]);

  const platforms = new Set(
    (channels.data ?? []).map((c) => (c as { platform: string }).platform),
  );

  const features: FeatureKey[] = [];
  // El super_admin no tiene empresa: ve la plataforma entera, así que se le
  // consideran todos los módulos disponibles para poder explicarlos.
  if (role === "super_admin") {
    features.push("inbox", "bot", "cotizador", "sheets", "ads", "forms");
  } else {
    if (
      platforms.has("whatsapp") ||
      platforms.has("instagram") ||
      platforms.has("facebook")
    ) {
      features.push("inbox");
    }
    if ((bot.data ?? []).length > 0) features.push("bot");
    if ((valuation as { count?: number }).count) features.push("cotizador");
    if ((sheets as { count?: number }).count) features.push("sheets");
    if (
      platforms.has("metaads") ||
      platforms.has("tiktok") ||
      platforms.has("google")
    ) {
      features.push("ads");
    }
    if ((forms as { count?: number }).count) features.push("forms");
  }

  const types = (productTypes.data ?? [])
    .map((r) => (r as { product_types: { name: string } | null }).product_types?.name)
    .filter((n): n is string => Boolean(n));

  const botMode = (bot.data ?? [])[0] as { mode?: string } | undefined;

  const ctx: CapsuleInput = {
    profile,
    role,
    displayName: fullNameOf(profile.first_name, profile.last_name),
    companyName: (company.data as { name?: string } | null)?.name ?? null,
    plan: ((company.data as { plan?: CompanyPlanEnum } | null)?.plan ??
      null) as CompanyPlanEnum | null,
    branchName: (branch.data as { name?: string } | null)?.name ?? null,
    productTypes: types,
    managerName: manager.data
      ? fullNameOf(
          (manager.data as { first_name: string }).first_name,
          (manager.data as { last_name: string }).last_name,
        )
      : null,
    features,
    route,
  };

  return {
    ...ctx,
    capsule: renderCapsule(ctx, botMode?.mode ?? null),
    scopeKey: scopeKeyOf(ctx),
  };
}

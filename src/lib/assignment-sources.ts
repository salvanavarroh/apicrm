// ============================================================================
// Todas las puertas de entrada de leads, con su regla de reparto.
//
// El valor de juntarlas en una consulta no es técnico: hasta ahora la config de
// reparto vivía en cinco pantallas distintas y dos orígenes no tenían ninguna,
// así que nadie podía responder "¿cómo se reparten hoy los leads?" sin abrir
// cinco lugares y adivinar los otros dos.
// ============================================================================

import {
  modeOf,
  type RuleMember,
  type RuleMode,
  type SourceKind,
  type VendorOption,
} from "@/lib/assignment-rules";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export type LoadedSource = {
  kind: SourceKind;
  id: string;
  name: string;
  /** Segunda línea: el número, el slug, el id de Meta. */
  detail: string | null;
  /** Plataforma del canal (whatsapp, instagram, google…), para el logo. */
  platform: string | null;
  /** false = el origen está apagado; se muestra apagado en la lista. */
  active: boolean;
  mode: RuleMode | "inherit";
  members: RuleMember[];
};

export type AssignmentOverview = {
  defaultRule: { mode: RuleMode; members: RuleMember[]; label: string };
  groups: { kind: SourceKind; rows: LoadedSource[] }[];
  vendors: VendorOption[];
};

const MODE_LABEL: Record<RuleMode, string> = {
  balanced: "Equilibrado",
  turns: "Por turno",
  fixed: "Siempre al mismo vendedor",
  pool: "Sin asignar",
};

export async function loadAssignmentOverview(
  companyId: string,
): Promise<AssignmentOverview> {
  const supabase = await createClient();

  const [
    { data: rules },
    { data: ruleMembers },
    { data: metaForms },
    { data: captureForms },
    { data: sheets },
    { data: channels },
    { data: vendorRows },
  ] = await Promise.all([
    supabase
      .from("assignment_rules")
      .select("id, name, strategy, is_default")
      .eq("company_id", companyId),
    supabase
      .from("assignment_rule_members")
      .select("rule_id, user_id, weight")
      .eq("company_id", companyId),
    supabase
      .from("lead_ad_forms")
      .select("id, meta_form_id, form_name, assignment_rule_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_capture_forms")
      .select("id, name, slug, status, assignment_rule_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("sheet_sources")
      .select("id, name, active, assignment_rule_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("messaging_channels")
      .select("id, platform, display_name, external_ref, status, assignment_rule_id")
      .eq("company_id", companyId)
      // Sólo los canales de MENSAJERÍA. Meta Ads, TikTok Ads y Google Ads
      // también son filas de `messaging_channels`, pero no traen
      // conversaciones: los de ads sólo aportan métricas, y los leads de Meta
      // entran por formulario (y aparecen en su propio grupo). Mostrarlos acá
      // con un botón de reparto era ofrecer una configuración que no hace nada.
      .in("platform", ["whatsapp", "instagram", "facebook"])
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, branches(name)")
      .eq("company_id", companyId)
      .eq("role", "sales")
      .eq("status", "active")
      .order("first_name"),
  ]);

  const membersByRule = new Map<string, RuleMember[]>();
  for (const m of ruleMembers ?? []) {
    const list = membersByRule.get(m.rule_id) ?? [];
    list.push({ userId: m.user_id, weight: m.weight });
    membersByRule.set(m.rule_id, list);
  }

  const ruleById = new Map((rules ?? []).map((r) => [r.id, r]));
  const def = (rules ?? []).find((r) => r.is_default) ?? null;
  const defMembers = def ? membersByRule.get(def.id) ?? [] : [];
  const defMode: RuleMode = def
    ? modeOf(def.strategy, defMembers.length)
    : "balanced";

  /** Traduce el `assignment_rule_id` de un origen a lo que muestra la UI. */
  function resolve(ruleId: string | null): {
    mode: RuleMode | "inherit";
    members: RuleMember[];
  } {
    if (!ruleId) return { mode: "inherit", members: [] };
    const rule = ruleById.get(ruleId);
    if (!rule) return { mode: "inherit", members: [] };
    const members = membersByRule.get(rule.id) ?? [];
    return { mode: modeOf(rule.strategy, members.length), members };
  }

  const groups: AssignmentOverview["groups"] = [
    {
      kind: "meta_form" as const,
      rows: (metaForms ?? []).map((f) => ({
        kind: "meta_form" as const,
        id: f.id,
        name: f.form_name?.trim() || f.meta_form_id,
        detail: f.meta_form_id,
        platform: "facebook",
        active: true,
        ...resolve(f.assignment_rule_id),
      })),
    },
    {
      kind: "channel" as const,
      rows: (channels ?? []).map((c) => ({
        kind: "channel" as const,
        id: c.id,
        name: c.display_name || c.external_ref || c.platform,
        // El canal ya dice su plataforma con el logo; la segunda línea es el
        // número o el @usuario, que es lo que identifica a cuál de los tres.
        detail: c.display_name ? c.external_ref : null,
        platform: c.platform,
        active: c.status === "active",
        ...resolve(c.assignment_rule_id),
      })),
    },
    {
      kind: "capture_form" as const,
      rows: (captureForms ?? []).map((f) => ({
        kind: "capture_form" as const,
        id: f.id,
        name: f.name,
        detail: `/f/${f.slug}`,
        platform: null,
        active: f.status === "active",
        ...resolve(f.assignment_rule_id),
      })),
    },
    {
      kind: "sheet" as const,
      rows: (sheets ?? []).map((s) => ({
        kind: "sheet" as const,
        id: s.id,
        name: s.name,
        detail: null,
        platform: null,
        active: s.active,
        ...resolve(s.assignment_rule_id),
      })),
    },
  ];

  return {
    defaultRule: {
      mode: defMode,
      members: defMembers,
      label: MODE_LABEL[defMode],
    },
    groups,
    vendors: (vendorRows ?? []).map((v) => ({
      id: v.id,
      name: fullName(v.first_name, v.last_name),
      branch: (v.branches as { name: string } | null)?.name ?? null,
    })),
  };
}

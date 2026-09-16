// ============================================================================
// Reglas de reparto de leads — lo que comparten el server y el cliente.
//
// En la base hay TRES estrategias; en la UI se ven CUATRO opciones. No es una
// inconsistencia: "a un vendedor fijo" es una rueda de un solo lugar, o sea la
// misma estrategia `turns` con un miembro. Separarlas en la pantalla es lo que
// el usuario entiende; unirlas en el motor es lo que hace que haya dos caminos
// de código para testear en vez de cuatro.
//
// Ver docs/reparto-de-leads.md y la migración `assignment_rules`.
// ============================================================================

/** Lo que guarda la base. */
export type RuleStrategy = "balanced" | "turns" | "pool";

/** Lo que elige el usuario. */
export type RuleMode = "balanced" | "turns" | "fixed" | "pool";

export type RuleMember = { userId: string; weight: number };

export const RULE_MODES: {
  value: RuleMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "balanced",
    label: "Equilibrado",
    hint: "Al vendedor con menos leads abiertos, dentro de la gerencia que corresponde por sucursal y tipo de producto. Es lo que hace el CRM por defecto.",
  },
  {
    value: "turns",
    label: "Por turno",
    hint: "Rotativo entre los vendedores que elijas. Podés darle más peso a uno que a otro.",
  },
  {
    value: "fixed",
    label: "Siempre al mismo vendedor",
    hint: "Todos los leads de este origen van a una sola persona.",
  },
  {
    value: "pool",
    label: "Sin asignar",
    hint: "El lead queda en el pool y lo toma el primero que lo agarre.",
  },
];

export function ruleModeMeta(mode: RuleMode) {
  return RULE_MODES.find((m) => m.value === mode) ?? RULE_MODES[0];
}

/** Estrategia que se guarda para cada opción de la UI. */
export function strategyOf(mode: RuleMode): RuleStrategy {
  if (mode === "fixed") return "turns";
  return mode;
}

/** Opción de la UI a partir de lo guardado. */
export function modeOf(strategy: RuleStrategy, memberCount: number): RuleMode {
  if (strategy !== "turns") return strategy;
  return memberCount <= 1 ? "fixed" : "turns";
}

/**
 * La rueda de turnos, igual que `assignment_wheel()` en la base.
 *
 * Cada vendedor con peso w ocupa las posiciones (k + 0.5) / w para k en
 * 0..w-1; al ordenar esas fracciones los turnos quedan INTERCALADOS y no
 * agrupados: 70/30 da J P J J J P J J P J, no siete Juan seguidos.
 *
 * Está duplicada en SQL y acá a propósito, y tiene que dar lo mismo: la de la
 * base reparte, la de acá dibuja el preview. Un preview que no coincide con el
 * reparto real es peor que no tener preview.
 */
export function buildWheel(members: RuleMember[]): string[] {
  const slots: { at: number; userId: string }[] = [];
  for (const m of members) {
    const w = Math.max(1, Math.round(m.weight));
    for (let k = 0; k < w; k++) {
      slots.push({ at: (k + 0.5) / w, userId: m.userId });
    }
  }
  slots.sort((a, b) => a.at - b.at || a.userId.localeCompare(b.userId));
  return slots.map((s) => s.userId);
}

/**
 * Simplifica los pesos por su máximo común divisor: 70/30 se guarda como 7/3.
 *
 * No es cosmética. La rueda tiene un lugar por unidad de peso, así que 70/30
 * daría 100 lugares y el preview de "los próximos 10" mostraría un tramo de un
 * patrón de 100, no el ciclo completo. Con 7/3 el ciclo entra en 10 y lo que
 * ve el usuario es exactamente lo que va a pasar.
 *
 * La usan el cliente (antes de mandar) y el server (antes de guardar), para que
 * preview y reparto real trabajen sobre los mismos números.
 */
export function reduceWeights(members: RuleMember[]): RuleMember[] {
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  const ws = members.map((m) => Math.max(1, Math.round(m.weight)));
  const g = ws.reduce((a, b) => gcd2(a, b), ws[0] ?? 1) || 1;
  return members.map((m, i) => ({ ...m, weight: Math.max(1, ws[i] / g) }));
}

/** Un vendedor elegible para una regla. */
export type VendorOption = { id: string; name: string; branch: string | null };

/**
 * Pesos a porcentajes para mostrar. Se calcula sobre el total, así el usuario
 * ve el reparto real aunque los números no sumen 100.
 */
export function weightsToPercent(members: RuleMember[]): Map<string, number> {
  const total = members.reduce((a, m) => a + Math.max(1, m.weight), 0) || 1;
  const out = new Map<string, number>();
  for (const m of members) {
    out.set(m.userId, Math.round((Math.max(1, m.weight) / total) * 100));
  }
  return out;
}

/** Los orígenes que pueden tener regla propia. */
export type SourceKind =
  | "meta_form"
  | "capture_form"
  | "sheet"
  | "channel"
  | "import";

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  meta_form: "Formularios de Facebook",
  capture_form: "Formularios propios",
  sheet: "Planillas de Google",
  channel: "WhatsApp y redes",
  import: "Carga masiva",
};

export type SourceRow = {
  kind: SourceKind;
  /** id de la fila del origen (lead_ad_forms.id, sheet_sources.id, …). */
  id: string;
  name: string;
  detail: string | null;
  ruleId: string | null;
};

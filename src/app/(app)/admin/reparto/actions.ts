"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  reduceWeights,
  strategyOf,
  type RuleMode,
  type SourceKind,
} from "@/lib/assignment-rules";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type Result = { ok: true } | { ok: false; message: string };

/** Tabla y etiqueta de cada tipo de origen que puede tener regla propia. */
const SOURCE_TABLES = {
  meta_form: "lead_ad_forms",
  capture_form: "lead_capture_forms",
  sheet: "sheet_sources",
  channel: "messaging_channels",
} as const;

type ConfigurableKind = keyof typeof SOURCE_TABLES;

function isConfigurable(kind: SourceKind): kind is ConfigurableKind {
  return kind in SOURCE_TABLES;
}

export type SaveRuleInput = {
  kind: SourceKind;
  /** Vacío = la regla de la empresa. */
  sourceId: string;
  /** "inherit" desengancha el origen y lo deja usando la de la empresa. */
  mode: RuleMode | "inherit";
  members: { userId: string; weight: number }[];
  /** Nombre visible. Si no viene, se arma con el del origen. */
  name?: string;
};

function validate(input: SaveRuleInput): string | null {
  if (input.mode === "inherit") {
    if (!input.sourceId) {
      return "La regla de la empresa no puede heredar de sí misma";
    }
    return null;
  }
  if (input.mode === "fixed" && input.members.length !== 1) {
    return "Elegí el vendedor que va a atender este origen";
  }
  if (input.mode === "turns" && input.members.length < 2) {
    return "Elegí al menos dos vendedores para el reparto por turno";
  }
  if (
    (input.mode === "turns" || input.mode === "fixed") &&
    input.members.some((m) => !Number.isFinite(m.weight) || m.weight < 1)
  ) {
    return "Los pesos tienen que ser números mayores a cero";
  }
  return null;
}

/** Reemplaza el set de vendedores de una regla. */
async function replaceMembers(
  admin: Admin,
  companyId: string,
  ruleId: string,
  members: { userId: string; weight: number }[],
): Promise<void> {
  await admin.from("assignment_rule_members").delete().eq("rule_id", ruleId);
  if (members.length === 0) return;
  // Pesos enteros y acotados: la rueda de la base los usa como cantidad de
  // lugares, así que 70/30 son 7 y 3 y no hace falta guardar porcentajes.
  const rows = reduceWeights(members).map((m) => ({
    rule_id: ruleId,
    user_id: m.userId,
    company_id: companyId,
    weight: Math.max(1, Math.min(100, Math.round(m.weight))),
  }));
  await admin.from("assignment_rule_members").insert(rows);
}

/**
 * Borra una regla que quedó sin ningún origen apuntándole.
 *
 * Cada origen tiene su propia regla, así que desenganchar deja huérfana la
 * anterior. Sin esto, prender y apagar "usar la de la empresa" iría dejando
 * reglas muertas para siempre. Nunca toca la default.
 */
async function dropIfOrphan(admin: Admin, ruleId: string): Promise<void> {
  const { data: rule } = await admin
    .from("assignment_rules")
    .select("id, is_default")
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule || rule.is_default) return;

  for (const table of Object.values(SOURCE_TABLES)) {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("assignment_rule_id", ruleId);
    if ((count ?? 0) > 0) return;
  }
  await admin.from("assignment_rules").delete().eq("id", ruleId);
}

/**
 * Guarda el reparto de un origen (o de la empresa, con sourceId vacío).
 *
 * Cada origen es dueño de su regla: no se comparten entre orígenes. El reuso
 * pasa por la regla de la empresa, que es la que usan todos los que no tienen
 * una propia — que es el caso común. Compartir reglas con nombre entre varios
 * orígenes se puede agregar después sin migración.
 */
export async function saveAssignmentRule(input: SaveRuleInput): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const companyId = profile.company_id!;
  const admin = createAdminClient();

  const invalid = validate(input);
  if (invalid) return { ok: false, message: invalid };

  // --- La regla de la empresa ---
  if (!input.sourceId) {
    const { data: def } = await admin
      .from("assignment_rules")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();
    if (!def) return { ok: false, message: "La empresa no tiene regla por defecto" };
    if (input.mode === "inherit") {
      return { ok: false, message: "La regla de la empresa no puede heredar" };
    }
    const { error } = await admin
      .from("assignment_rules")
      .update({ strategy: strategyOf(input.mode) })
      .eq("id", def.id);
    if (error) return { ok: false, message: error.message };
    await replaceMembers(
      admin,
      companyId,
      def.id,
      input.mode === "turns" || input.mode === "fixed" ? input.members : [],
    );
    revalidatePath("/admin/reparto");
    return { ok: true };
  }

  // --- Un origen concreto ---
  if (!isConfigurable(input.kind)) {
    return { ok: false, message: "Ese origen no se configura por regla" };
  }
  const table = SOURCE_TABLES[input.kind];

  const { data: source } = await admin
    .from(table)
    .select("id, assignment_rule_id")
    .eq("id", input.sourceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!source) return { ok: false, message: "El origen ya no existe" };

  const previous = source.assignment_rule_id;

  if (input.mode === "inherit") {
    const { error } = await admin
      .from(table)
      .update({ assignment_rule_id: null })
      .eq("id", source.id);
    if (error) return { ok: false, message: error.message };
    if (previous) await dropIfOrphan(admin, previous);
    revalidatePath("/admin/reparto");
    revalidatePath("/admin/integraciones");
    return { ok: true };
  }

  const strategy = strategyOf(input.mode);
  const name = input.name?.trim() || "Reparto propio";
  let ruleId = previous;

  if (ruleId) {
    const { error } = await admin
      .from("assignment_rules")
      .update({ strategy, name })
      .eq("id", ruleId)
      .eq("company_id", companyId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data: created, error } = await admin
      .from("assignment_rules")
      .insert({ company_id: companyId, name, strategy })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, message: error?.message ?? "No se pudo crear la regla" };
    }
    ruleId = created.id;
    const { error: linkError } = await admin
      .from(table)
      .update({ assignment_rule_id: ruleId })
      .eq("id", source.id);
    if (linkError) return { ok: false, message: linkError.message };
  }

  await replaceMembers(
    admin,
    companyId,
    ruleId,
    strategy === "turns" ? input.members : [],
  );

  revalidatePath("/admin/reparto");
  revalidatePath("/admin/integraciones");
  return { ok: true };
}

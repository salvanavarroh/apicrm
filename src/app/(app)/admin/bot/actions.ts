"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { BASE_INTENTS } from "@/lib/bot/base-intents";
import { BOT_VARS, describeHours } from "@/lib/bot/variables";
import { createClient } from "@/lib/supabase/server";

// Server actions de la configuración del bot. Todo requiere admin: es
// configuración comercial, no operación diaria.

type Result = { ok: true } | { ok: false; message: string };

export type BotBranchConfig = {
  branchId: string;
  branchName: string;
  configId: string | null;
  enabled: boolean;
  mode: "draft" | "auto";
  outsideHours: boolean;
  whenNobodyActive: boolean;
  idleTriggerMinutes: number | null;
  maxTurns: number;
  greetingName: string | null;
  qualify: boolean;
  freeAnswer: boolean;
  knowledge: string | null;
  maxAnswerChars: number;
};

/** Config por sucursal. Las que no tienen fila todavía salen con los defaults. */
export async function listBotConfigs(): Promise<BotBranchConfig[]> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: branches }, { data: configs }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", profile.company_id!)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("bot_configs")
      .select("*")
      .eq("company_id", profile.company_id!),
  ]);

  const byBranch = new Map((configs ?? []).map((c) => [c.branch_id, c]));

  return (branches ?? []).map((b) => {
    const c = byBranch.get(b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      configId: c?.id ?? null,
      // Defaults: apagado y en borrador. Encenderlo es explícito.
      enabled: c?.enabled ?? false,
      mode: (c?.mode ?? "draft") as "draft" | "auto",
      outsideHours: c?.outside_hours ?? true,
      whenNobodyActive: c?.when_nobody_active ?? true,
      idleTriggerMinutes: c?.idle_trigger_minutes ?? null,
      maxTurns: c?.max_turns ?? 3,
      greetingName: c?.greeting_name ?? null,
      qualify: c?.qualify ?? false,
      freeAnswer: c?.free_answer ?? false,
      knowledge: c?.knowledge ?? null,
      maxAnswerChars: c?.max_answer_chars ?? 400,
    };
  });
}

export async function saveBotConfig(input: {
  branchId: string;
  enabled: boolean;
  mode: "draft" | "auto";
  outsideHours: boolean;
  whenNobodyActive: boolean;
  idleTriggerMinutes: number | null;
  maxTurns: number;
  greetingName: string | null;
  qualify: boolean;
  freeAnswer: boolean;
  knowledge: string | null;
  maxAnswerChars: number;
}): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const { error } = await supabase.from("bot_configs").upsert(
    {
      company_id: profile.company_id!,
      branch_id: input.branchId,
      enabled: input.enabled,
      mode: input.mode,
      outside_hours: input.outsideHours,
      when_nobody_active: input.whenNobodyActive,
      idle_trigger_minutes: input.idleTriggerMinutes,
      max_turns: input.maxTurns,
      greeting_name: input.greetingName?.trim() || null,
      qualify: input.qualify,
      free_answer: input.freeAnswer,
      knowledge: input.knowledge?.trim() || null,
      max_answer_chars: input.maxAnswerChars,
    },
    { onConflict: "branch_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bot");
  return { ok: true };
}

export type BotIntentRow = {
  id: string;
  slug: string;
  label: string;
  keywords: string[];
  reply: string;
  enabled: boolean;
};

export async function listBotIntents(): Promise<BotIntentRow[]> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_intents")
    .select("id, slug, label, keywords, reply, enabled")
    .eq("company_id", profile.company_id!)
    .order("sort_order")
    .order("label");
  return (data ?? []) as BotIntentRow[];
}

/** Carga las 8 FAQ base. Idempotente: no pisa las que el admin ya editó. */
export async function seedBaseIntents(): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("bot_intents")
    .select("slug")
    .eq("company_id", profile.company_id!);
  const have = new Set((existing ?? []).map((r) => r.slug));

  const missing = BASE_INTENTS.filter((i) => !have.has(i.slug));
  if (missing.length === 0) {
    return { ok: false, message: "Las preguntas base ya estaban cargadas" };
  }

  const { error } = await supabase.from("bot_intents").insert(
    missing.map((i, idx) => ({
      company_id: profile.company_id!,
      branch_id: null,
      slug: i.slug,
      label: i.label,
      keywords: i.keywords,
      reply: i.reply,
      sort_order: idx,
    })),
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bot");
  return { ok: true };
}

export async function saveBotIntent(input: {
  id: string;
  label: string;
  reply: string;
  keywords: string;
  enabled: boolean;
}): Promise<Result> {
  await requireRole(["admin"]);
  const reply = input.reply.trim();
  if (!reply) return { ok: false, message: "La respuesta no puede estar vacía" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bot_intents")
    .update({
      label: input.label.trim(),
      reply,
      keywords: input.keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
      enabled: input.enabled,
    })
    .eq("id", input.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bot");
  return { ok: true };
}

// --- Aprendizaje: qué preguntas no supo contestar ---------------------------

export type UnknownQuestion = {
  text: string;
  count: number;
  lastAt: string;
};

/**
 * Mensajes que cayeron en "desconocida", agrupados por texto normalizado.
 *
 * Es el bucle de mejora del bot y no usa IA generativa: el admin ve qué le
 * preguntan y no sabe responder, y lo convierte en una pregunta frecuente.
 */
export async function listUnknownQuestions(): Promise<UnknownQuestion[]> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("bot_messages")
    .select("inbound_text, created_at")
    .eq("company_id", profile.company_id!)
    .is("intent_slug", null)
    .order("created_at", { ascending: false })
    .limit(500);

  // Se agrupa por texto normalizado: "atienden hoy?" y "Atienden hoy" son la
  // misma pregunta y no queremos verla dos veces.
  const agg = new Map<string, { text: string; count: number; lastAt: string }>();
  for (const row of data ?? []) {
    const raw = (row.inbound_text ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
    const cur = agg.get(key);
    if (cur) cur.count += 1;
    else agg.set(key, { text: raw, count: 1, lastAt: row.created_at });
  }

  return [...agg.values()].sort((a, b) => b.count - a.count).slice(0, 40);
}

/** Crea una pregunta frecuente nueva a partir de algo que el bot no supo. */
export async function createIntentFromQuestion(input: {
  label: string;
  keywords: string;
  reply: string;
}): Promise<Result> {
  const profile = await requireRole(["admin"]);
  const reply = input.reply.trim();
  const label = input.label.trim();
  if (!reply || !label) {
    return { ok: false, message: "Falta el nombre o la respuesta" };
  }

  // Slug a partir del nombre, con sufijo si ya existe.
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "intencion";

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("bot_intents")
    .select("slug")
    .eq("company_id", profile.company_id!);
  const taken = new Set((existing ?? []).map((r) => r.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}_${n++}`;

  const { error } = await supabase.from("bot_intents").insert({
    company_id: profile.company_id!,
    branch_id: null,
    slug,
    label,
    keywords: input.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
    reply,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bot");
  return { ok: true };
}

// --- Variables ---------------------------------------------------------------

export type BranchVars = {
  branchId: string;
  branchName: string;
  values: Record<string, string>;
  /** Variables sin dato cargado. Son las que van a salir vacías. */
  missing: string[];
};

/**
 * Valores reales de las variables, por sucursal.
 *
 * Es lo que arregla el problema de fondo: el admin veía `{horario}` crudo en cada
 * respuesta y creía que tenía que completarlo a mano en las ocho. Se resuelven
 * solas desde la empresa y la sucursal; acá se muestran ya resueltas para que se
 * vea que no hay nada que escribir, y qué dato falta cargar cuando falta.
 */
export async function getBranchVariables(): Promise<BranchVars[]> {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: company }, { data: branches }, { data: configs }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "name, phone, inbox_hours_enabled, inbox_hours_start, inbox_hours_end, inbox_hours_days",
        )
        .eq("id", profile.company_id!)
        .maybeSingle(),
      supabase
        .from("branches")
        .select("id, name, address, phone")
        .eq("company_id", profile.company_id!)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("bot_configs")
        .select("branch_id, greeting_name")
        .eq("company_id", profile.company_id!),
    ]);

  const greetingByBranch = new Map(
    (configs ?? []).map((c) => [c.branch_id, c.greeting_name]),
  );
  const horario = company ? describeHours(company) : "de lunes a viernes";

  return (branches ?? []).map((b) => {
    const values: Record<string, string> = {
      // El nombre del cliente sale de cada conversación: acá se muestra un
      // ejemplo para que la vista previa se lea como un mensaje de verdad.
      nombre: "Juan",
      concesionaria:
        greetingByBranch.get(b.id) || company?.name || "la concesionaria",
      sucursal: b.name ?? "",
      direccion: b.address ?? "",
      telefono: b.phone ?? company?.phone ?? "",
      horario,
    };
    const missing = BOT_VARS.filter(
      (v) => v.key !== "nombre" && !values[v.key],
    ).map((v) => v.key);
    return { branchId: b.id, branchName: b.name, values, missing };
  });
}

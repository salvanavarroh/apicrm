"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { BASE_INTENTS } from "@/lib/bot/base-intents";
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

import { classify } from "@/lib/bot/classify";
import { decide, type BotConfig } from "@/lib/bot/decide";
import { checkGuardrails } from "@/lib/bot/guardrails";
import { sendInboxMessage } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Orquestador del bot: junta guardrails + decisión + clasificador y actúa.
//
// Se llama desde el webhook de mensajería después de haber guardado el mensaje
// entrante. TODO está envuelto en try/catch: un fallo del bot nunca puede
// romper la recepción de un mensaje del cliente.
//
// En modo `draft` NO envía nada: deja la respuesta sugerida en bot_messages y el
// asesor la manda con un clic desde el inbox.
// ============================================================================

const HANDOFF_REPLY =
  "Dejame que un asesor te responda esto y te contesta a la brevedad. " +
  "Ya le avisé que estás esperando.";

const UNKNOWN_REPLY =
  "Gracias por escribir. Un asesor te va a responder en cuanto se conecte. " +
  "Si querés hablar con una persona ya, escribí *asesor*.";

/** Minutos de espera del cliente, para el disparador por demora. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** Reemplaza las variables de la respuesta con datos reales. */
function fill(
  reply: string,
  ctx: { nombre: string; sucursal: string; horario: string; concesionaria: string },
): string {
  return reply
    .replaceAll("{nombre}", ctx.nombre)
    .replaceAll("{sucursal}", ctx.sucursal)
    .replaceAll("{horario}", ctx.horario)
    .replaceAll("{concesionaria}", ctx.concesionaria);
}

/** "09:00:00" → 9. Las columnas de horario son `time`, no enteros. */
function hourOf(t: string | null, fallback: number): number {
  if (!t) return fallback;
  const h = Number(t.slice(0, 2));
  return Number.isFinite(h) ? h : fallback;
}

/** Está dentro del horario de atención configurado en la empresa. */
function withinHours(company: {
  inbox_hours_enabled: boolean | null;
  inbox_hours_start: string | null;
  inbox_hours_end: string | null;
  inbox_hours_days: number[] | null;
}): boolean {
  // Si no hay horario configurado, se asume abierto: no queremos que el bot
  // conteste todo el día por una config vacía.
  if (!company.inbox_hours_enabled) return true;
  const now = new Date();
  const day = now.getDay();
  const days = company.inbox_hours_days ?? [1, 2, 3, 4, 5];
  if (!days.includes(day)) return false;
  const h = now.getHours();
  return (
    h >= hourOf(company.inbox_hours_start, 9) &&
    h < hourOf(company.inbox_hours_end, 18)
  );
}

export type BotRunResult = {
  acted: boolean;
  reason: string;
  sent?: boolean;
  intent?: string | null;
};

/**
 * Evalúa y (si corresponde) responde una conversación.
 *
 * @param conversationId conversación del CRM
 * @param inboundText    texto del mensaje del cliente
 */
export async function runBotForConversation(
  conversationId: string,
  inboundText: string,
): Promise<BotRunResult> {
  const admin = createAdminClient();

  const { data: conv } = await admin
    .from("conversations")
    .select(
      `id, company_id, branch_id, participant_name, lead_id, assigned_user_id,
       window_expires_at, last_inbound_at, zernio_conversation_id,
       channel:messaging_channels (zernio_account_id)`,
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { acted: false, reason: "conversación no encontrada" };

  // La config es POR SUCURSAL. Sin sucursal en la conversación no hay política
  // que aplicar: preferimos no responder antes que adivinar.
  if (!conv.branch_id) {
    return { acted: false, reason: "conversación sin sucursal" };
  }

  const [{ data: cfgRow }, { data: company }, { data: state }] =
    await Promise.all([
      admin
        .from("bot_configs")
        .select("*")
        .eq("branch_id", conv.branch_id)
        .maybeSingle(),
      admin
        .from("companies")
        .select(
          "name, inbox_hours_enabled, inbox_hours_start, inbox_hours_end, inbox_hours_days",
        )
        .eq("id", conv.company_id)
        .maybeSingle(),
      admin
        .from("bot_conversation_state")
        .select("*")
        .eq("conversation_id", conversationId)
        .maybeSingle(),
    ]);

  if (!cfgRow || !cfgRow.enabled) {
    return { acted: false, reason: "bot apagado en esta sucursal" };
  }

  const config: BotConfig = {
    enabled: cfgRow.enabled,
    mode: cfgRow.mode as "draft" | "auto",
    outsideHours: cfgRow.outside_hours,
    whenNobodyActive: cfgRow.when_nobody_active,
    idleTriggerMinutes: cfgRow.idle_trigger_minutes,
    maxTurns: cfgRow.max_turns,
  };

  // ¿Hay alguien activo? Misma ventana de frescura que el round-robin.
  const staleIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: activeCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", conv.company_id)
    .eq("role", "sales")
    .eq("status", "active")
    .eq("inbox_available", true)
    .gt("inbox_available_at", staleIso);

  const decision = decide(config, {
    withinHours: company ? withinHours(company) : true,
    someoneActive: (activeCount ?? 0) > 0,
    minutesWaiting: minutesSince(conv.last_inbound_at),
    turnsUsed: state?.turns_used ?? 0,
    humanReplied: state?.human_replied ?? false,
    windowOpen: conv.window_expires_at
      ? new Date(conv.window_expires_at) > new Date()
      : false,
  });

  if (!decision.act) {
    return { acted: false, reason: decision.reason };
  }

  // ---- Guardrails: corren ANTES del clasificador -------------------------
  const guard = checkGuardrails(inboundText);

  let reply: string;
  let intentSlug: string | null = null;
  let matchedBy = "blacklist";

  if (guard.kind === "handoff" || guard.kind === "blocked") {
    reply = HANDOFF_REPLY;
    matchedBy = guard.kind === "handoff" ? "handoff" : "blacklist";
    // El que pregunta por plata es el más caliente que hay.
    if (conv.lead_id) {
      await admin
        .from("leads")
        .update({
          temperature: "hot",
          temperature_set_at: new Date().toISOString(),
        })
        .eq("id", conv.lead_id);
    }
    await admin
      .from("bot_conversation_state")
      .upsert(
        {
          conversation_id: conversationId,
          company_id: conv.company_id,
          handoff_requested: true,
        },
        { onConflict: "conversation_id" },
      );
  } else {
    // ---- Clasificación ---------------------------------------------------
    const { data: intents } = await admin
      .from("bot_intents")
      .select("slug, label, keywords, reply")
      .eq("company_id", conv.company_id)
      .eq("enabled", true)
      .or(`branch_id.is.null,branch_id.eq.${conv.branch_id}`);

    const candidates = (intents ?? []).map((i) => ({
      slug: i.slug,
      label: i.label,
      keywords: i.keywords ?? [],
    }));
    const cls = await classify(inboundText, candidates);
    intentSlug = cls.slug;
    matchedBy = cls.matchedBy;

    const found = (intents ?? []).find((i) => i.slug === cls.slug);
    reply = found?.reply ?? UNKNOWN_REPLY;
  }

  const branchName = await admin
    .from("branches")
    .select("name")
    .eq("id", conv.branch_id)
    .maybeSingle();

  const horario =
    company?.inbox_hours_enabled && company.inbox_hours_start
      ? `de ${hourOf(company.inbox_hours_start, 9)}:00 a ${hourOf(
          company.inbox_hours_end,
          18,
        )}:00`
      : "de lunes a viernes";

  const finalText = fill(reply, {
    nombre: (conv.participant_name ?? "").split(" ")[0] ?? "",
    sucursal: branchName.data?.name ?? "",
    horario,
    concesionaria: cfgRow.greeting_name || company?.name || "la concesionaria",
  });

  // ---- Envío o borrador --------------------------------------------------
  let sent = false;
  if (decision.mode === "auto") {
    const accountId = (
      conv.channel as { zernio_account_id: string } | null
    )?.zernio_account_id;
    if (accountId && conv.zernio_conversation_id) {
      try {
        await sendInboxMessage(conv.zernio_conversation_id, {
          accountId,
          message: finalText,
        });
        sent = true;
        await admin.from("messages").insert({
          company_id: conv.company_id,
          conversation_id: conversationId,
          direction: "outbound",
          sender_type: "bot",
          message_type: "text",
          body: finalText,
        });
        await admin
          .from("conversations")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", conversationId);
      } catch {
        // Si Zernio falla, queda registrado como sugerencia no enviada: el
        // asesor la ve en el inbox y decide.
        sent = false;
      }
    }
  }

  // ---- Log y estado ------------------------------------------------------
  await admin.from("bot_messages").insert({
    company_id: conv.company_id,
    conversation_id: conversationId,
    inbound_text: inboundText.slice(0, 1000),
    intent_slug: intentSlug,
    matched_by: matchedBy,
    reply_sent: finalText,
    was_sent: sent,
  });

  if (sent) {
    await admin
      .from("bot_conversation_state")
      .upsert(
        {
          conversation_id: conversationId,
          company_id: conv.company_id,
          turns_used: (state?.turns_used ?? 0) + 1,
          last_bot_reply_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      );
  }

  return {
    acted: true,
    reason: decision.trigger,
    sent,
    intent: intentSlug,
  };
}

/** Marca que un humano contestó: apaga el bot para esa conversación. */
export async function markHumanReplied(conversationId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("company_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;
  await admin.from("bot_conversation_state").upsert(
    {
      conversation_id: conversationId,
      company_id: conv.company_id,
      human_replied: true,
    },
    { onConflict: "conversation_id" },
  );
}

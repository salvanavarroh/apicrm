/**
 * Seed de datos MOCK para probar el inbox sin conectar WhatsApp/Meta.
 * Crea canales (WhatsApp/Instagram/Facebook) + conversaciones en varios estados
 * (pool, asignadas, ventana abierta/cerrada, con atribución) + mensajes + leads.
 *
 * Uso:
 *   pnpm tsx scripts/seed-mock-inbox.ts            # limpia lo mock anterior y siembra
 *   pnpm tsx scripts/seed-mock-inbox.ts --clean    # solo borra los datos mock
 *   COMPANY_ID=<uuid> pnpm tsx scripts/seed-mock-inbox.ts
 *
 * Todo lo mock lleva marcadores 'mock_' (channels.zernio_account_id,
 * conversations.zernio_conversation_id, leads.external_id) para poder limpiarlo.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CLEAN_ONLY = process.argv.includes("--clean");
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

type Platform = "whatsapp" | "instagram" | "facebook";

async function resolveContext() {
  // Empresa: env, o "Nueva Conse", o la primera activa con más usuarios.
  let companyId = process.env.COMPANY_ID ?? null;
  if (!companyId) {
    const { data } = await db
      .from("companies")
      .select("id, name")
      .eq("status", "active");
    const nueva = (data ?? []).find((c) => c.name === "Nueva Conse");
    companyId = nueva?.id ?? data?.[0]?.id ?? null;
  }
  if (!companyId) throw new Error("No hay empresa activa");

  const { data: profiles } = await db
    .from("profiles")
    .select("id, role, first_name, last_name")
    .eq("company_id", companyId)
    .eq("status", "active");
  const admin = (profiles ?? []).find((p) => p.role === "admin");
  const sales = (profiles ?? []).filter((p) => p.role === "sales");

  const { data: branches } = await db
    .from("branches")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);
  const { data: pts } = await db
    .from("product_types")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);

  return {
    companyId,
    adminId: admin?.id ?? null,
    sales1: sales[0]?.id ?? admin?.id ?? null,
    sales2: sales[1]?.id ?? sales[0]?.id ?? admin?.id ?? null,
    branchId: branches?.[0]?.id ?? null,
    productTypeId: pts?.[0]?.id ?? null,
  };
}

async function clean(companyId: string) {
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .like("zernio_conversation_id", "mock_%");
  const ids = (convs ?? []).map((c) => c.id);
  if (ids.length) {
    await db.from("messages").delete().in("conversation_id", ids);
    await db.from("conversations").delete().in("id", ids);
  }
  await db.from("messaging_channels").delete().like("zernio_account_id", "mock_%");
  await db.from("leads").delete().like("external_id", "mock_%").eq("company_id", companyId);
  console.log("  🧹 datos mock previos borrados");
}

async function main() {
  const ctx = await resolveContext();
  console.log(`Empresa objetivo: ${ctx.companyId}`);
  await clean(ctx.companyId);
  if (CLEAN_ONLY) {
    console.log("Listo (solo limpieza).");
    return;
  }

  // 1) Canales mock (uno por plataforma).
  const channelDefs: { platform: Platform; acct: string; name: string }[] = [
    { platform: "whatsapp", acct: "mock_wa_acct", name: "WhatsApp Demo +54 11 5555-0000" },
    { platform: "instagram", acct: "mock_ig_acct", name: "@concesionaria.demo" },
    { platform: "facebook", acct: "mock_fb_acct", name: "Concesionaria Demo (FB)" },
  ];
  const channelId: Record<Platform, string> = {} as never;
  for (const c of channelDefs) {
    const { data } = await db
      .from("messaging_channels")
      .insert({
        company_id: ctx.companyId,
        zernio_account_id: c.acct,
        platform: c.platform,
        external_ref: c.name,
        display_name: c.name,
        status: "active",
        connected_at: iso(60),
      })
      .select("id")
      .single();
    channelId[c.platform] = data!.id;
  }
  console.log("  ✓ 3 canales mock creados (WhatsApp, Instagram, Facebook)");

  // 2) Escenarios de conversación.
  type Scenario = {
    key: string;
    platform: Platform;
    lead: { first: string; last: string; phone?: string; handle?: string };
    assignedTo: string | null;
    windowMins: number; // minutos hasta que expira la ventana (negativo = cerrada)
    attribution?: Record<string, unknown>;
    messages: { dir: "in" | "out"; body: string; minsAgo: number; by?: string | null }[];
  };

  const scenarios: Scenario[] = [
    {
      key: "wa-pool",
      platform: "whatsapp",
      lead: { first: "Carla", last: "Giménez", phone: "+5491155550001" },
      assignedTo: null,
      windowMins: 60 * 23,
      messages: [
        { dir: "in", body: "Hola! Vi el Corolla 0km, ¿sigue disponible?", minsAgo: 8 },
        { dir: "in", body: "¿Aceptan usado en parte de pago?", minsAgo: 7 },
      ],
    },
    {
      key: "wa-mine-open",
      platform: "whatsapp",
      lead: { first: "Diego", last: "Fernández", phone: "+5491155550002" },
      assignedTo: ctx.adminId,
      windowMins: 60 * 22,
      messages: [
        { dir: "in", body: "Buenas, quería consultar por la Hilux SRV", minsAgo: 90 },
        { dir: "out", body: "Hola Diego! Sí, tenemos unidades. ¿La querés 4x2 o 4x4?", minsAgo: 80, by: ctx.adminId },
        { dir: "in", body: "4x4 diésel automática", minsAgo: 12 },
      ],
    },
    {
      key: "wa-sales-closed",
      platform: "whatsapp",
      lead: { first: "Marina", last: "Ruiz", phone: "+5491155550003" },
      assignedTo: ctx.sales1,
      windowMins: -60 * 6, // ventana CERRADA (último inbound hace >24h)
      messages: [
        { dir: "in", body: "Hola, me pasaron un presupuesto la semana pasada", minsAgo: 60 * 30 },
        { dir: "out", body: "Hola Marina! Te reenvío el presupuesto actualizado.", minsAgo: 60 * 29, by: ctx.sales1 },
      ],
    },
    {
      key: "ig-pool",
      platform: "instagram",
      lead: { first: "Sofía", last: "", handle: "@sofi.autos" },
      assignedTo: null,
      windowMins: 60 * 23,
      messages: [
        { dir: "in", body: "Holaa! Precio del Hilux usado que subieron hoy? 🚙", minsAgo: 20 },
      ],
    },
    {
      key: "fb-mine",
      platform: "facebook",
      lead: { first: "Roberto", last: "Sosa", handle: "Roberto Sosa" },
      assignedTo: ctx.adminId,
      windowMins: 60 * 20,
      messages: [
        { dir: "in", body: "Vi la publicación del plan de ahorro, cómo funciona?", minsAgo: 200 },
        { dir: "out", body: "Hola Roberto! Te explico: son 84 cuotas...", minsAgo: 190, by: ctx.adminId },
        { dir: "in", body: "Perfecto, y la primera cuota cuánto sería?", minsAgo: 40 },
      ],
    },
    {
      key: "wa-ctwa",
      platform: "whatsapp",
      lead: { first: "Nahuel", last: "Paz", phone: "+5491155550006" },
      assignedTo: null,
      windowMins: 60 * 23,
      attribution: { ctwa_clid: "MOCK_CTWA_123", ad_id: "MOCK_AD_FINANCIACION" },
      messages: [
        { dir: "in", body: "Hola, vengo del anuncio de financiación del Onix", minsAgo: 5 },
      ],
    },
    {
      key: "wa-sales2",
      platform: "whatsapp",
      lead: { first: "Valentina", last: "Ortiz", phone: "+5491155550007" },
      assignedTo: ctx.sales2,
      windowMins: 60 * 18,
      messages: [
        { dir: "in", body: "Coordinamos el test drive del Cronos?", minsAgo: 300 },
        { dir: "out", body: "Dale! ¿Te queda cómodo el sábado a las 11?", minsAgo: 295, by: ctx.sales2 },
        { dir: "in", body: "Sí, perfecto 👍", minsAgo: 30 },
      ],
    },
  ];

  let convCount = 0;
  let msgCount = 0;
  for (const s of scenarios) {
    const lastInbound = Math.min(...s.messages.filter((m) => m.dir === "in").map((m) => m.minsAgo));
    const lastMsg = s.messages[s.messages.length - 1];

    // Lead — IG/FB sin teléfono usan un email placeholder (constraint: phone o email).
    const placeholderEmail = s.lead.phone ? null : `mock_${s.key}@demo.local`;
    const { data: lead, error: leadErr } = await db
      .from("leads")
      .insert({
        company_id: ctx.companyId,
        first_name: s.lead.first || null,
        last_name: s.lead.last || null,
        phone: s.lead.phone ?? null,
        phone_e164: s.lead.phone ?? null,
        email: placeholderEmail,
        source: s.platform === "whatsapp" ? "WhatsApp" : s.platform === "instagram" ? "Instagram" : "Facebook",
        external_id: `mock_${s.key}`,
        status: "new",
        branch_id: ctx.branchId,
        product_type_id: ctx.productTypeId,
        assigned_user_id: s.assignedTo,
        assigned_at: s.assignedTo ? iso(300) : null,
      })
      .select("id")
      .single();
    if (leadErr || !lead) {
      console.error(`  ✗ lead ${s.key}:`, leadErr?.message ?? "sin data");
      continue;
    }

    // Conversation
    const { data: conv } = await db
      .from("conversations")
      .insert({
        company_id: ctx.companyId,
        channel_id: channelId[s.platform],
        lead_id: lead!.id,
        zernio_conversation_id: `mock_conv_${s.key}`,
        platform: s.platform,
        participant_phone_e164: s.lead.phone ?? null,
        participant_handle: s.lead.handle ?? null,
        participant_name: `${s.lead.first} ${s.lead.last}`.trim(),
        assigned_user_id: s.assignedTo,
        claimed_at: s.assignedTo ? iso(300) : null,
        status: "open",
        window_expires_at: new Date(Date.now() + s.windowMins * 60_000).toISOString(),
        last_inbound_at: iso(lastInbound),
        last_outbound_at: lastMsg.dir === "out" ? iso(lastMsg.minsAgo) : null,
        last_message_preview: lastMsg.body.slice(0, 120),
        unread_count: s.assignedTo ? 0 : s.messages.filter((m) => m.dir === "in").length,
        attribution: (s.attribution ?? {}) as never,
      })
      .select("id")
      .single();
    convCount++;

    // Messages
    let i = 0;
    for (const m of s.messages) {
      await db.from("messages").insert({
        company_id: ctx.companyId,
        conversation_id: conv!.id,
        zernio_message_id: `mock_msg_${s.key}_${i}`,
        direction: m.dir === "in" ? "inbound" : "outbound",
        sender_type: m.dir === "in" ? "contact" : "agent",
        sent_by_user_id: m.by ?? null,
        message_type: "text",
        body: m.body,
        delivery_status: m.dir === "in" ? "delivered" : "read",
        platform_timestamp: iso(m.minsAgo),
        created_at: iso(m.minsAgo),
      });
      msgCount++;
      i++;
    }
  }

  console.log(`  ✓ ${convCount} conversaciones y ${msgCount} mensajes mock creados`);
  console.log("\nListo. Entrá al inbox logueado como admin de esa empresa (Lucas G / Nueva Conse).");
}

main().then(() => process.exit(0));

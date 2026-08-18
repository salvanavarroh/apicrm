/**
 * Alta de la cuenta de prueba "Cambalache".
 *
 * Crea la concesionaria, la sucursal, engancha el profile de Zernio que ya tiene
 * las integraciones conectadas ("Nueva Conse": WhatsApp, Instagram, Google Ads),
 * rutea esos canales a la sucursal, crea el usuario Admin y deja el bot cargado
 * en modo borrador.
 *
 * El id de la empresa es a propósito el mismo que el `name` del profile de
 * Zernio: así queda como lo habría dejado `ensureProfile()` y el webhook resuelve
 * la empresa igual que en cualquier alta normal.
 *
 * Uso (los tres pasos, en orden):
 *   pnpm tsx scripts/provision-cambalache.ts
 *   pnpm seed:company --company e18fba50-593e-464c-bba7-998325c0ca6f --branch "Casa Central"
 *   pnpm tsx scripts/provision-cambalache.ts   # ahora sí asigna las campañas
 *
 * El ida y vuelta es porque las campañas de canal las crea `seed:company`, que
 * necesita que la empresa exista. Todo es idempotente: rerunearlo no duplica
 * nada (sí resetea la contraseña del Admin y la vuelve a imprimir).
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const COMPANY_ID = "e18fba50-593e-464c-bba7-998325c0ca6f";
const ZERNIO_PROFILE_ID = "6a63a0fffdc9353fa8ac19e1"; // "Nueva Conse"
const COMPANY_NAME = "Cambalache";
const BRANCH_NAME = "Casa Central";
const ADMIN_EMAIL = "apicrmai+cambalache@gmail.com";

// Canales que reciben conversaciones: necesitan sucursal, porque el bot y el
// scoping del inbox trabajan por sucursal (conversación sin sucursal = el bot no
// interviene).
const INBOX_PLATFORMS = ["whatsapp", "instagram", "facebook"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan credenciales de Supabase en .env.local");

  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 1. Concesionaria ----------------------------------------------------
  const { data: existing } = await db
    .from("companies")
    .select("id, name")
    .eq("id", COMPANY_ID)
    .maybeSingle();

  if (existing) {
    console.log(`= Concesionaria ya existe: ${existing.name}`);
  } else {
    const { error } = await db.from("companies").insert({
      id: COMPANY_ID,
      name: COMPANY_NAME,
      phone: "+5491173858039", // el WhatsApp que está conectado en Zernio
      status: "active",
      plan: "personalizado",
      monthly_price: 0, // cuenta interna de prueba
      subscription_starts_at: "2026-08-18",
      subscription_ends_at: "2027-12-31",
      zernio_profile_id: ZERNIO_PROFILE_ID,
      inbox_tz: "America/Argentina/Buenos_Aires",
      inbox_hours_enabled: false,
    });
    if (error) throw error;
    console.log(`+ Concesionaria creada: ${COMPANY_NAME} (${COMPANY_ID})`);
  }

  // --- 2. Sucursal ---------------------------------------------------------
  let branchId: string;
  const { data: branch } = await db
    .from("branches")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("name", BRANCH_NAME)
    .maybeSingle();
  if (branch) {
    branchId = branch.id;
    console.log(`= Sucursal ya existe: ${BRANCH_NAME}`);
  } else {
    const { data, error } = await db
      .from("branches")
      .insert({ company_id: COMPANY_ID, name: BRANCH_NAME, status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    branchId = data.id;
    console.log(`+ Sucursal creada: ${BRANCH_NAME}`);
  }

  // --- 3. Canales de Zernio ------------------------------------------------
  // Se importa acá (dinámico) para que loadEnvConfig ya haya corrido cuando
  // `@/lib/env` valide las variables.
  const { syncCompanyChannels } = await import("@/lib/messaging/sync-channels");
  const synced = await syncCompanyChannels(COMPANY_ID, ZERNIO_PROFILE_ID);
  console.log(`+ ${synced} cuenta(s) de Zernio sincronizadas como canales`);

  const { data: channels } = await db
    .from("messaging_channels")
    .select("id, platform, display_name, branch_id, status")
    .eq("company_id", COMPANY_ID);

  for (const ch of channels ?? []) {
    if (!INBOX_PLATFORMS.includes(ch.platform) || ch.branch_id) continue;
    const { error } = await db
      .from("messaging_channels")
      .update({ branch_id: branchId })
      .eq("id", ch.id);
    if (error) throw error;
    console.log(`  → ${ch.platform} (${ch.display_name}) ruteado a ${BRANCH_NAME}`);
  }
  // Defaults de clasificación de los canales de inbox, igual que en el piloto:
  // los canales de ads (google/tiktok/metaads) van sin sucursal ni campaña
  // porque son fuentes de métricas, no de conversaciones.
  const { data: types } = await db
    .from("product_types")
    .select("id, name")
    .eq("company_id", COMPANY_ID);
  const { data: camps } = await db
    .from("campaigns")
    .select("id, name")
    .eq("company_id", COMPANY_ID);
  const typeId = (n: string) => types?.find((t) => t.name === n)?.id ?? null;
  const campId = (n: string) => camps?.find((c) => c.name === n)?.id ?? null;

  for (const [platform, campaign] of [
    ["whatsapp", "WhatsApp"],
    ["instagram", "Instagram"],
  ] as const) {
    const patch = {
      product_type_id: typeId("Convencional"),
      campaign_id: campId(campaign),
    };
    if (!patch.product_type_id && !patch.campaign_id) continue;
    await db
      .from("messaging_channels")
      .update(patch)
      .eq("company_id", COMPANY_ID)
      .eq("platform", platform);
  }

  for (const ch of channels ?? []) {
    console.log(`  · ${ch.platform.padEnd(10)} ${ch.status.padEnd(13)} ${ch.display_name ?? ""}`);
  }

  // --- 4. Usuario Admin ----------------------------------------------------
  const { data: list, error: listErr } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  let user = list.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  // Contraseña larga y aleatoria: se imprime una sola vez, se cambia desde el panel.
  const password = `Cmbl-${randomBytes(9).toString("base64url")}`;

  if (user) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log(`= Usuario ya existía: ${ADMIN_EMAIL} (contraseña reseteada)`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user!;
    console.log(`+ Usuario creado: ${ADMIN_EMAIL}`);
  }

  const { error: profErr } = await db.from("profiles").upsert(
    {
      id: user.id,
      company_id: COMPANY_ID,
      // El Admin no se limita a una sucursal: branch_id null = ve todo.
      branch_id: null,
      role: "admin",
      status: "active",
      first_name: "Cambalache",
      last_name: "Admin",
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profErr) throw profErr;
  console.log(`+ Perfil admin listo (company=${COMPANY_NAME})`);

  // --- 5. Bot: config + preguntas base ------------------------------------
  const { data: cfg } = await db
    .from("bot_configs")
    .select("id")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (cfg) {
    console.log("= Bot ya configurado en la sucursal");
  } else {
    const { error } = await db.from("bot_configs").insert({
      company_id: COMPANY_ID,
      branch_id: branchId,
      // Encendido pero en BORRADOR: sugiere y el asesor manda. No le escribe a
      // nadie hasta pasarlo a 'auto' desde el panel.
      enabled: true,
      mode: "draft",
      outside_hours: true,
      when_nobody_active: true,
      idle_trigger_minutes: 7,
      max_turns: 3,
      greeting_name: COMPANY_NAME,
    });
    if (error) throw error;
    console.log("+ Bot configurado: encendido en modo borrador");
  }

  const { BASE_INTENTS } = await import("@/lib/bot/base-intents");
  const { data: haveIntents } = await db
    .from("bot_intents")
    .select("slug")
    .eq("company_id", COMPANY_ID);
  const have = new Set((haveIntents ?? []).map((r) => r.slug));
  const missing = BASE_INTENTS.filter((i) => !have.has(i.slug));
  if (missing.length === 0) {
    console.log("= Preguntas base del bot ya cargadas");
  } else {
    const { error } = await db.from("bot_intents").insert(
      missing.map((i, idx) => ({
        company_id: COMPANY_ID,
        branch_id: null,
        slug: i.slug,
        label: i.label,
        keywords: i.keywords,
        reply: i.reply,
        sort_order: idx,
      })),
    );
    if (error) throw error;
    console.log(`+ ${missing.length} pregunta(s) base del bot cargadas`);
  }

  console.log("\n───────────────────────────────────────────");
  console.log("  Concesionaria:  " + COMPANY_NAME);
  console.log("  company_id:     " + COMPANY_ID);
  console.log("  branch_id:      " + branchId);
  console.log("  Email:          " + ADMIN_EMAIL);
  console.log("  Contraseña:     " + password);
  console.log("───────────────────────────────────────────\n");
  if ((camps ?? []).length === 0) {
    console.log(
      "Ahora corré:  pnpm seed:company --company " +
        COMPANY_ID +
        ' --branch "' +
        BRANCH_NAME +
        '"\ny después este script otra vez, para asignarle las campañas a los canales.',
    );
  }
}

main().catch((e) => {
  console.error("Falló:", e);
  process.exit(1);
});

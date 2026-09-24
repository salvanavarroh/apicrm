/**
 * Crea (o borra) la concesionaria de prueba que usa el equipo de MotorBox para
 * probar el SSO de punta a punta.
 *
 *   pnpm seed:motorbox-test
 *   pnpm seed:motorbox-test --remove
 *
 * Por qué existe: un ticket suelto no sirve para probar — vive 90 segundos.
 * MotorBox necesita poder entrar al CRM y apretar "Motorbox" cuantas veces
 * quiera, generando tickets frescos.
 *
 * No hay entorno de staging para API CRM (un solo proyecto de Supabase), así
 * que esta cuenta vive en la base del piloto. Por eso queda:
 *   - con nombre inequívoco,
 *   - SIN monthly_price → fuera del cron de facturación,
 *   - con su propia sucursal, sin tocar datos de nadie.
 *
 * Idempotente: correrlo de nuevo no duplica, sólo reporta lo que ya está.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COMPANY_NAME = "MotorBox — Cuenta de prueba";
const EMAIL = "prueba.motorbox@apicrm.ai";
const FIRST_NAME = "Prueba";
const LAST_NAME = "MotorBox";
const BRANCH_NAME = "Casa Central";
const remove = process.argv.includes("--remove");

/** Contraseña legible pero no adivinable: se dicta por teléfono sin errores. */
function password(): string {
  const b = randomBytes(9).toString("base64").replace(/[+/=]/g, "");
  return `Motorbox-${b}-2026`;
}

async function findCompany() {
  const { data } = await supabase
    .from("companies").select("id, name").eq("name", COMPANY_NAME).maybeSingle();
  return data;
}

async function findAuthUser() {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === EMAIL) ?? null;
}

async function main() {
  if (remove) {
    const company = await findCompany();
    const user = await findAuthUser();
    if (user) {
      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.admin.deleteUser(user.id);
      console.log("  usuario borrado");
    }
    if (company) {
      await supabase.from("branches").delete().eq("company_id", company.id);
      await supabase.from("companies").delete().eq("id", company.id);
      console.log("  concesionaria borrada");
    }
    if (!user && !company) console.log("  no había nada que borrar");
    return;
  }

  // 1) La concesionaria.
  let company = await findCompany();
  if (company) {
    console.log(`  concesionaria: ya existía (${company.id})`);
  } else {
    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: COMPANY_NAME,
        legal_name: "Cuenta de prueba de la integración con MotorBox",
        country: "AR",
        status: "active",
        // Sin monthly_price a propósito: así el cron de facturación la ignora.
        monthly_price: null,
      })
      .select("id, name")
      .single();
    if (error || !data) throw new Error(`No se pudo crear la empresa: ${error?.message}`);
    company = data;
    console.log(`  concesionaria: creada (${company.id})`);
  }

  // 2) Una sucursal, para que el perfil que consume MotorBox no venga vacío.
  const { data: branch } = await supabase
    .from("branches").select("id").eq("company_id", company.id).eq("name", BRANCH_NAME).maybeSingle();
  if (branch) {
    console.log("  sucursal: ya existía");
  } else {
    await supabase.from("branches").insert({
      company_id: company.id,
      name: BRANCH_NAME,
      address: "Av. de Prueba 1234, CABA",
      status: "active",
    });
    console.log("  sucursal: creada");
  }

  // 3) El usuario. Si ya existe le reseteamos la contraseña, así el script
  //    siempre termina pudiendo darte un acceso usable.
  const pass = password();
  let user = await findAuthUser();
  if (user) {
    await supabase.auth.admin.updateUserById(user.id, { password: pass });
    console.log("  usuario: ya existía — contraseña reseteada");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: pass,
      email_confirm: true, // sin mail de verificación: nadie lee esa casilla
      user_metadata: { first_name: FIRST_NAME, last_name: LAST_NAME },
    });
    if (error || !data.user) throw new Error(`No se pudo crear el usuario: ${error?.message}`);
    user = data.user;
    console.log("  usuario: creado");
  }

  // 4) El profile. `status: active` para que entre directo, sin pasar por la
  //    pantalla de aceptar invitación.
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      company_id: company.id,
      first_name: FIRST_NAME,
      last_name: LAST_NAME,
      role: "admin",
      status: "active",
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  console.log("  perfil: admin de la concesionaria de prueba");

  console.log(`
  ── Accesos ─────────────────────────────────────────────
     URL ............ https://www.apicrm.ai/login
     Email .......... ${EMAIL}
     Contraseña ..... ${pass}
     Rol ............ Admin
     Concesionaria .. ${COMPANY_NAME}
     company_id ..... ${company.id}
  ────────────────────────────────────────────────────────

  Compartilo por gestor de contraseñas, no por mail ni WhatsApp.
  Para borrar todo:  pnpm seed:motorbox-test --remove
`);
}

void main().catch((e) => {
  console.error("  ERROR:", e.message);
  process.exit(1);
});

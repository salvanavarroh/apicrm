/**
 * Bootstrap del primer SuperAdmin.
 *
 * Lee SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD de .env.local.
 * Si el user no existe en auth.users, lo crea con email confirmado.
 * Después hace upsert en profiles con role='super_admin' y status='active'.
 *
 * Uso:  pnpm seed:super-admin
 * Idempotente: rerunearlo solo actualiza el rol/status si ya existe.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import type { Database } from "@/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}
if (!email || !password) {
  console.error(
    "Faltan SUPER_ADMIN_EMAIL o SUPER_ADMIN_PASSWORD en .env.local",
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(target: string) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return (
    data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase()) ??
    null
  );
}

async function main() {
  const normalizedEmail = email!.toLowerCase().trim();

  let user = await findUserByEmail(normalizedEmail);

  if (!user) {
    console.log(`Creando user en auth.users: ${normalizedEmail}`);
    const created = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    user = created.data.user;
    console.log(`  → creado (id=${user.id})`);
  } else {
    console.log(`User ya existe: ${normalizedEmail} (id=${user.id})`);
  }

  const { error: upsertError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      role: "super_admin",
      status: "active",
      terms_accepted_at: new Date().toISOString(),
      first_name: "",
      last_name: "",
    },
    { onConflict: "id" },
  );

  if (upsertError) throw upsertError;

  console.log(`SuperAdmin listo: ${normalizedEmail} (role=super_admin)`);
}

main().catch((err) => {
  console.error("Bootstrap falló:", err);
  process.exit(1);
});

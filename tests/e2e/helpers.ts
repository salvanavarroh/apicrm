import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el env de tests",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function superAdminCredentials() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD");
  }
  return { email, password };
}

export async function deleteUserByEmail(email: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return;
  const u = data.users.find(
    (x) => x.email?.toLowerCase() === email.toLowerCase(),
  );
  if (u) await admin.auth.admin.deleteUser(u.id);
}

/** Borra todos los users cuyo email matchee el prefijo dado. Para cleanup
 *  entre tests E2E.
 */
export async function deleteUsersByPrefix(prefix: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return;
  const matching = data.users.filter((x) =>
    x.email?.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  for (const u of matching) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

export async function deleteCompaniesByName(pattern: string) {
  const admin = adminClient();
  await admin.from("companies").delete().like("name", pattern);
}

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client for privileged server-side ops (cron, webhooks, admin tasks).
 * Bypasses RLS — never import from client components or expose to the browser.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

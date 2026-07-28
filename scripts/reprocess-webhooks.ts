/**
 * Re-despacha los webhook_events que no quedaron 'processed' (fallidos/pendientes)
 * usando los handlers actuales. Sirve para recuperar mensajes que fallaron por un
 * bug del handler. Corre contra la base que apunte .env.local.
 *
 * Uso:  pnpm tsx scripts/reprocess-webhooks.ts
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Cargar el env ANTES de importar módulos de la app que validan env (env.ts).
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Import dinámico: acá el env ya está cargado.
  const { dispatchEvent } = await import("@/lib/messaging/dispatch");

  const { data: events } = await db
    .from("webhook_events")
    .select("event_id, event_type, payload")
    .neq("status", "processed")
    .order("received_at", { ascending: true });

  console.log(`Reprocesando ${events?.length ?? 0} eventos…`);
  let done = 0;
  for (const e of events ?? []) {
    await dispatchEvent(
      e.event_type,
      e.payload as Record<string, unknown>,
      e.event_id,
    );
    done++;
    if (done % 50 === 0) console.log(`  … ${done}`);
  }

  const { data: after } = await db.from("webhook_events").select("status");
  const counts: Record<string, number> = {};
  for (const r of after ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("Estado final webhook_events:", counts);

  const { count: convs } = await db
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .not("zernio_conversation_id", "like", "mock_%");
  console.log(`Conversaciones reales ahora: ${convs}`);
}

main().then(() => process.exit(0));

import { publicOrigin } from "@/lib/motorbox/config";
import { signOutbound } from "@/lib/motorbox/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Webhooks salientes: le avisamos a Motorbox de lo que afecta su vidriera.
//
// Regla: BEST-EFFORT, nunca bloqueante. Nadie puede quedar sin poder suspender
// una concesionaria porque el marketplace está caído. Si falla, se loguea y la
// acción del CRM sigue su curso.
//
// Contrato: docs/motorbox-spec-motorbox.md §12.
// ============================================================================

export type MotorboxEventType =
  | "company.suspended"
  | "company.reactivated"
  | "company.updated"
  | "user.deactivated"
  | "whatsapp.changed";

const TIMEOUT_MS = 5_000;

/**
 * ¿Esta empresa usa Motorbox? Sin esto le mandaríamos eventos de las ~200
 * concesionarias que nunca entraron, y el otro lado tendría que filtrarlos.
 */
async function usesMotorbox(companyId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("motorbox_enabled_at")
    .eq("id", companyId)
    .maybeSingle();
  return Boolean(data?.motorbox_enabled_at);
}

export async function notifyMotorbox(
  type: MotorboxEventType,
  companyId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const origin = publicOrigin();
  if (!origin) return;
  if (!(await usesMotorbox(companyId))) return;

  const body = JSON.stringify({
    // Estable e idempotente: si reintentamos, Motorbox deduplica por acá.
    event_id: `${type}:${companyId}:${Math.floor(Date.now() / 1000)}`,
    type,
    company_id: companyId,
    occurred_at: new Date().toISOString(),
    ...payload,
  });

  const headers = signOutbound(body);
  if (!headers) return; // sin API_CRM_WEBHOOK_SECRET no mandamos nada sin firmar

  try {
    const res = await fetch(`${origin}/api/partners/api-crm/events`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Ver la nota en listings.ts: un redirect acá puede tirar la firma HMAC.
    if (res.redirected) {
      console.error(
        `[motorbox] MOTORBOX_PUBLIC_ORIGIN redirige (→ ${res.url}). Usá el host canónico exacto.`,
      );
    }
    if (!res.ok) {
      console.error(`[motorbox] evento ${type} rechazado: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error(`[motorbox] evento ${type} no entregado:`, (e as Error).message);
  }
}

/**
 * Marca que una concesionaria empezó a usar Motorbox. Se llama desde el
 * endpoint del ticket, la primera vez que alguien entra.
 */
export async function markMotorboxEnabled(companyId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("companies")
    .update({ motorbox_enabled_at: new Date().toISOString() })
    .eq("id", companyId)
    .is("motorbox_enabled_at", null);
}

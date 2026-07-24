// Despacho de eventos de webhook de Zernio a su handler. Marca el estado en
// webhook_events. Se llama desde `after()` en la route (post-ACK).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleAccountConnected,
  handleAccountDisconnected,
  handleDeliveryStatus,
  handleInboundMessage,
  handleLeadReceived,
  handleTemplateStatus,
} from "@/lib/messaging/handlers";

type Json = Record<string, unknown>;

export async function dispatchEvent(
  eventType: string,
  payload: Json,
  eventId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  try {
    switch (eventType) {
      case "message.received":
      case "conversation.started":
        await handleInboundMessage(payload);
        break;
      case "message.sent":
      case "message.delivered":
      case "message.read":
      case "message.failed":
        await handleDeliveryStatus(eventType, payload);
        break;
      case "lead.received":
        await handleLeadReceived(payload);
        break;
      case "account.connected":
        await handleAccountConnected(payload);
        break;
      case "account.disconnected":
        await handleAccountDisconnected(payload);
        break;
      case "whatsapp.template.status_updated":
        await handleTemplateStatus(payload);
        break;
      default:
        // Evento no manejado (todavía): queda registrado en webhook_events.
        break;
    }
    if (eventId) {
      await admin
        .from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("event_id", eventId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[zernio-dispatch] ${eventType} falló:`, msg);
    if (eventId) {
      await admin
        .from("webhook_events")
        .update({ status: "failed", last_error: msg })
        .eq("event_id", eventId);
    }
  }
}

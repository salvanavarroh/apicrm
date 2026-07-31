import { ExternalLink, MessageSquare } from "lucide-react";
import Link from "next/link";

import { BrandIcon } from "@/components/integrations/brand-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadConversation } from "@/lib/lead-conversations";

const PLATFORM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

function convTitle(c: LeadConversation): string {
  return (
    c.participant_name ??
    c.participant_handle ??
    c.participant_phone_e164 ??
    PLATFORM_LABEL[c.platform] ??
    "Conversación"
  );
}

// Sección "Mensajes" del detalle del lead: muestra las conversaciones del contacto
// con un preview de los últimos mensajes y un botón para abrirlas en el Inbox.
export function LeadConversationCard({
  conversations,
}: {
  conversations: LeadConversation[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4 text-accent" />
          Mensajes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {conversations.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Todavía no hay conversaciones de WhatsApp/Instagram/Facebook con este
            contacto.
          </p>
        ) : (
          conversations.map((c) => (
            <div key={c.id} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <BrandIcon platform={c.platform} className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{convTitle(c)}</span>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {c.unread_count} sin responder
                    </span>
                  )}
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={`/admin/inbox?c=${c.id}`}>
                    <ExternalLink className="mr-1 size-3.5" /> Abrir en Inbox
                  </Link>
                </Button>
              </div>

              <div className="mt-2.5 flex flex-col gap-1">
                {c.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin mensajes.</p>
                ) : (
                  c.messages.map((m) => {
                    const out = m.direction === "outbound";
                    return (
                      <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs",
                            out
                              ? "bg-primary text-primary-foreground"
                              : "border bg-card text-foreground",
                          )}
                        >
                          {m.body ? m.body : `[${m.message_type}]`}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

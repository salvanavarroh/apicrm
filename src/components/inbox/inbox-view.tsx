"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  claimConversation,
  getMessages,
  sendMessage,
  type InboxMessage,
} from "@/app/(app)/admin/inbox/actions";

export type ConversationListItem = {
  id: string;
  platform: string;
  participant_name: string | null;
  participant_phone_e164: string | null;
  assigned_user_id: string | null;
  status: string;
  unread_count: number;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  lead_id: string | null;
  updated_at: string;
};

const PLATFORM_EMOJI: Record<string, string> = {
  whatsapp: "🟢",
  instagram: "🟣",
  facebook: "🔵",
};

function windowOpen(iso: string | null): boolean {
  return !!iso && new Date(iso) > new Date();
}

export function InboxView({
  conversations,
  currentUserId,
}: {
  conversations: ConversationListItem[];
  currentUserId: string;
}) {
  const [selected, setSelected] = useState<ConversationListItem | null>(null);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[320px_1fr]">
      {/* Lista */}
      <div className="min-h-0 overflow-y-auto rounded-lg border">
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No hay conversaciones todavía.
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left hover:bg-muted/50",
                selected?.id === c.id && "bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {PLATFORM_EMOJI[c.platform] ?? ""}{" "}
                  {c.participant_name ?? c.participant_phone_e164 ?? "Contacto"}
                </span>
                {c.unread_count > 0 && (
                  <Badge className="bg-primary text-[10px] text-primary-foreground">
                    {c.unread_count}
                  </Badge>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {c.last_message_preview ?? ""}
              </span>
              <div className="flex gap-1">
                {!c.assigned_user_id && (
                  <Badge variant="outline" className="text-[10px]">
                    pool
                  </Badge>
                )}
                {c.assigned_user_id === currentUserId && (
                  <Badge variant="secondary" className="text-[10px]">
                    mía
                  </Badge>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Panel */}
      <div className="min-h-0 rounded-lg border">
        {selected ? (
          <Thread
            key={selected.id}
            conversation={selected}
            currentUserId={currentUserId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Elegí una conversación
          </div>
        )}
      </div>
    </div>
  );
}

function Thread({
  conversation,
  currentUserId,
}: {
  conversation: ConversationListItem;
  currentUserId: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMine = conversation.assigned_user_id === currentUserId;
  const isPool = !conversation.assigned_user_id;
  const canSend = isMine; // el dueño responde; admin/manager también (server valida)
  const wOpen = windowOpen(conversation.window_expires_at);

  useEffect(() => {
    getMessages(conversation.id).then(setMessages);
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  function claim() {
    start(async () => {
      const res = await claimConversation(conversation.id);
      if (res.ok) {
        toast.success("Conversación tomada");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const res = await sendMessage(conversation.id, body);
      if (res.ok) {
        setText("");
        const fresh = await getMessages(conversation.id);
        setMessages(fresh);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div>
          <div className="text-sm font-medium">
            {conversation.participant_name ??
              conversation.participant_phone_e164 ??
              "Contacto"}
          </div>
          <div className="text-xs text-muted-foreground">
            {conversation.participant_phone_e164 ?? ""} ·{" "}
            {wOpen ? (
              <span className="text-emerald-600">ventana abierta</span>
            ) : (
              <span className="text-amber-600">ventana cerrada (usar plantilla)</span>
            )}
          </div>
        </div>
        {conversation.lead_id && (
          <Button asChild size="sm" variant="outline">
            <a href={`/admin/leads/${conversation.lead_id}`}>Ver lead</a>
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages === null ? (
          <p className="text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                m.direction === "outbound"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              {m.direction === "outbound" && (
                <div className="mt-0.5 text-right text-[10px] opacity-70">
                  {m.delivery_status}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3">
        {isPool ? (
          <Button onClick={claim} disabled={pending} className="w-full">
            Tomar conversación
          </Button>
        ) : !wOpen ? (
          <p className="text-center text-xs text-amber-600">
            La ventana de 24h está cerrada. Enviá una plantilla aprobada para
            reabrir (módulo de plantillas).
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={canSend ? "Escribí un mensaje…" : "Sólo el dueño responde"}
              disabled={!canSend || pending}
              className="flex-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            />
            <Button onClick={send} disabled={!canSend || pending || !text.trim()}>
              Enviar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

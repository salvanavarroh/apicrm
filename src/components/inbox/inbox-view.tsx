"use client";

import { FileText, Info, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ChannelPill } from "@/components/inbox/channel-pill";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { InboxInsights } from "@/components/inbox/inbox-insights";
import { LeadInfoPanel } from "@/components/inbox/lead-info-panel";
import { TemplateSendDialog } from "@/components/inbox/template-send-dialog";
import { WindowCountdown } from "@/components/inbox/window-countdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dayLabel, listTime, msgTime, windowRemaining } from "@/lib/inbox-format";
import { cn } from "@/lib/utils";
import {
  claimConversation,
  getMessages,
  sendMessage,
  type InboxMessage,
} from "@/app/(app)/admin/inbox/actions";

export type VendorOption = { id: string; name: string };
export type ConversationListItem = {
  id: string;
  platform: string;
  participant_name: string | null;
  participant_phone_e164: string | null;
  participant_handle: string | null;
  assigned_user_id: string | null;
  assigned_name: string | null;
  status: string;
  unread_count: number;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  window_expires_at: string | null;
  lead_id: string | null;
  updated_at: string;
};

type Scope = "all" | "mine" | "pool";

export function InboxView({
  conversations,
  currentUserId,
  isPriv,
  vendors,
}: {
  conversations: ConversationListItem[];
  currentUserId: string;
  isPriv: boolean;
  vendors: VendorOption[];
}) {
  const [tab, setTab] = useState<"chats" | "insights">("chats");
  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [dateFrom, setDateFrom] = useState("");

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (platform && c.platform !== platform) return false;
      if (scope === "mine" && c.assigned_user_id !== currentUserId) return false;
      if (scope === "pool" && c.assigned_user_id) return false;
      if (vendorId && c.assigned_user_id !== vendorId) return false;
      if (dateFrom) {
        const ref = c.last_inbound_at ?? c.updated_at;
        if (ref && ref.slice(0, 10) < dateFrom) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay =
          `${c.participant_name ?? ""} ${c.participant_phone_e164 ?? ""} ${c.participant_handle ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, platform, scope, vendorId, dateFrom, search, currentUserId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-xs text-muted-foreground">
            Conversaciones de WhatsApp, Instagram y Facebook.
          </p>
        </div>
        {isPriv && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "chats" | "insights")}>
            <TabsList>
              <TabsTrigger value="chats">Conversaciones</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </header>

      {tab === "insights" ? (
        <InboxInsights />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1.5 left-2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="h-8 w-48 rounded-md border bg-background pr-2 pl-8 text-sm"
              />
            </div>
            <FilterSelect value={scope} onChange={(v) => setScope(v as Scope)} options={[
              { v: "all", l: "Todas" },
              { v: "mine", l: "Mías" },
              { v: "pool", l: "Pool" },
            ]} />
            <FilterSelect value={platform} onChange={setPlatform} placeholder="Canal" options={[
              { v: "", l: "Todos los canales" },
              { v: "whatsapp", l: "WhatsApp" },
              { v: "instagram", l: "Instagram" },
              { v: "facebook", l: "Facebook" },
            ]} />
            {isPriv && (
              <FilterSelect value={vendorId} onChange={setVendorId} placeholder="Vendedor" options={[
                { v: "", l: "Todos los vendedores" },
                ...vendors.map((v) => ({ v: v.id, l: v.name })),
              ]} />
            )}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm text-muted-foreground"
            />
            {(search || platform || vendorId || dateFrom || scope !== "all") && (
              <button
                onClick={() => {
                  setSearch(""); setPlatform(""); setVendorId(""); setDateFrom(""); setScope("all");
                }}
                className="text-xs text-muted-foreground underline"
              >
                Limpiar
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} conversaciones
            </span>
          </div>

          {/* 3 paneles */}
          <div className="flex min-h-0 flex-1">
            {/* Lista */}
            <div className="w-80 shrink-0 overflow-y-auto border-r bg-muted/20">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No hay conversaciones con esos filtros.
                </p>
              ) : (
                filtered.map((c) => (
                  <ConversationRow
                    key={c.id}
                    c={c}
                    active={selected?.id === c.id}
                    currentUserId={currentUserId}
                    onClick={() => {
                      setSelected(c);
                      setInfoOpen(!!c.lead_id);
                    }}
                  />
                ))
              )}
            </div>

            {/* Chat */}
            <div className="flex min-w-0 flex-1 flex-col bg-background">
              {selected ? (
                <Thread
                  key={selected.id}
                  conversation={selected}
                  currentUserId={currentUserId}
                  isPriv={isPriv}
                  infoOpen={infoOpen}
                  onToggleInfo={() => setInfoOpen((o) => !o)}
                  onClaimed={() =>
                    setSelected((s) =>
                      s ? { ...s, assigned_user_id: currentUserId } : s,
                    )
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Elegí una conversación
                </div>
              )}
            </div>

            {/* Panel info */}
            {infoOpen && selected?.lead_id && (
              <LeadInfoPanel
                key={selected.lead_id}
                leadId={selected.lead_id}
                onClose={() => setInfoOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border bg-background px-2 text-sm"
      aria-label={placeholder}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function ConversationRow({
  c,
  active,
  currentUserId,
  onClick,
}: {
  c: ConversationListItem;
  active: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  const isPool = !c.assigned_user_id;
  const isMine = c.assigned_user_id === currentUserId;
  const win = windowRemaining(c.window_expires_at);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        active && "bg-card shadow-sm",
      )}
    >
      <ContactAvatar name={c.participant_name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {c.participant_name ?? c.participant_phone_e164 ?? "Contacto"}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {listTime(c.last_inbound_at ?? c.updated_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <ChannelPill platform={c.platform} size="sm" />
          {c.unread_count > 0 && (
            <Badge className="ml-auto h-4 min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {c.unread_count}
            </Badge>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {c.last_message_preview ?? ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {isPool && (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              pool
            </Badge>
          )}
          {isMine && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              mía
            </Badge>
          )}
          {!isMine && !isPool && c.assigned_name && (
            <span className="text-[10px] text-muted-foreground">{c.assigned_name}</span>
          )}
          {!win.expired && (
            <span
              className={cn(
                "ml-auto text-[10px]",
                win.urgent ? "text-amber-600" : "text-emerald-600",
              )}
            >
              {win.text}
            </span>
          )}
          {win.expired && <span className="ml-auto text-[10px] text-red-500">cerrada</span>}
        </div>
      </div>
    </button>
  );
}

function Thread({
  conversation,
  currentUserId,
  isPriv,
  infoOpen,
  onToggleInfo,
  onClaimed,
}: {
  conversation: ConversationListItem;
  currentUserId: string;
  isPriv: boolean;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onClaimed: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMine = conversation.assigned_user_id === currentUserId;
  const isPool = !conversation.assigned_user_id;
  const canSend = isMine || isPriv;
  const win = windowRemaining(conversation.window_expires_at);

  useEffect(() => {
    getMessages(conversation.id).then(setMessages);
  }, [conversation.id]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  function refreshMessages() {
    getMessages(conversation.id).then(setMessages);
  }

  function claim() {
    start(async () => {
      const res = await claimConversation(conversation.id);
      if (res.ok) {
        toast.success("Conversación tomada");
        onClaimed();
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
        refreshMessages();
      } else toast.error(res.message);
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar name={conversation.participant_name} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {conversation.participant_name ??
                  conversation.participant_phone_e164 ??
                  "Contacto"}
              </span>
              <ChannelPill platform={conversation.platform} size="sm" />
            </div>
            <div className="text-xs text-muted-foreground">
              {conversation.participant_phone_e164 ?? conversation.participant_handle ?? ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WindowCountdown expiresAt={conversation.window_expires_at} />
          <TemplateSendDialog
            conversationId={conversation.id}
            onSent={refreshMessages}
            trigger={
              <Button size="sm" variant="outline">
                <FileText className="mr-1 size-4" /> Plantilla
              </Button>
            }
          />
          <Button
            size="sm"
            variant={infoOpen ? "default" : "outline"}
            onClick={onToggleInfo}
            disabled={!conversation.lead_id}
          >
            <Info className="mr-1 size-4" /> Info
          </Button>
        </div>
      </div>

      {/* Mensajes */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-muted/20 p-4">
        {messages === null ? (
          <p className="text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[70%] rounded-lg px-3 py-1.5 text-sm shadow-sm",
                    m.direction === "outbound"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-card",
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                      m.direction === "outbound"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {msgTime(m.created_at)}
                    {m.direction === "outbound" && <span>· {m.delivery_status}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex h-[68px] items-center border-t bg-card px-3">
        {isPool ? (
          <Button onClick={claim} disabled={pending} className="w-full">
            Tomar conversación
          </Button>
        ) : win.expired ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-amber-600">
              Ventana de 24h cerrada. Enviá una plantilla aprobada para reabrir.
            </p>
            <TemplateSendDialog
              conversationId={conversation.id}
              onSent={refreshMessages}
              trigger={<Button size="sm">Enviar plantilla</Button>}
            />
          </div>
        ) : (
          <div className="flex w-full gap-2">
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

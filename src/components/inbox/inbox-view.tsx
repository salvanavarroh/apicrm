"use client";

import { FileText, Info, Mic, Paperclip, Search, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  claimConversation,
  getMessages,
  sendAttachment,
  sendMessage,
  type Attachment,
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

// Clasifica un adjunto para elegir cómo mostrarlo (player, imagen o descarga).
function attachmentKind(a: Attachment): "image" | "audio" | "video" | "file" {
  const t = a.type ?? "";
  const m = a.payload?.mimeType ?? "";
  if (t === "image" || m.startsWith("image/")) return "image";
  if (t === "audio" || m.startsWith("audio/")) return "audio";
  if (t === "video" || m.startsWith("video/")) return "video";
  return "file";
}

// Adjuntos de un mensaje: imagen con preview, audio/video con player, resto como
// descarga. El src pega al proxy /api/inbox/media (nunca la URL cruda de Zernio).
function MessageAttachments({
  messageId,
  attachments,
  outbound,
}: {
  messageId: string;
  attachments: Attachment[];
  outbound: boolean;
}) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {attachments.map((a, i) => {
        const src = a.localUrl ?? `/api/inbox/media?msg=${messageId}&i=${i}`;
        const kind = attachmentKind(a);
        if (kind === "image") {
          return (
            <a key={i} href={src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="Imagen adjunta"
                className="max-h-64 w-auto max-w-full rounded-lg object-cover"
              />
            </a>
          );
        }
        if (kind === "audio") {
          return <audio key={i} controls src={src} className="h-9 w-56 max-w-full" />;
        }
        if (kind === "video") {
          return (
            <video
              key={i}
              controls
              src={src}
              className="max-h-64 w-auto max-w-full rounded-lg"
            />
          );
        }
        return (
          <a
            key={i}
            href={a.localUrl ?? `${src}&dl=1`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs underline-offset-2 hover:underline",
              outbound ? "bg-primary-foreground/15" : "bg-muted",
            )}
          >
            <Paperclip className="size-3.5" /> Abrir archivo
          </a>
        );
      })}
    </div>
  );
}

// Formato de grabación preferido: ogg/opus (compatible WhatsApp) si el browser
// lo soporta; si no, webm/opus (Chrome) o mp4 (Safari).
function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}
function fmtRecTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Grabadora de notas de voz: micrófono → MediaRecorder → File. El botón de stop
// (Enviar) confirma; el tacho descarta. Muestra un contador mientras graba.
function AudioRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (f: File) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        setSeconds(0);
        if (cancelledRef.current) return;
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) {
          onRecorded(new File([blob], `nota-de-voz.${ext}`, { type }));
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("No pudimos acceder al micrófono. Revisá los permisos.");
    }
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5">
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {fmtRecTime(seconds)}
        </span>
        <button
          type="button"
          title="Descartar"
          onClick={() => {
            cancelledRef.current = true;
            recorderRef.current?.stop();
          }}
          className="ml-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          title="Enviar nota de voz"
          onClick={() => recorderRef.current?.stop()}
          className="text-primary hover:opacity-80"
        >
          <Send className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title="Grabar nota de voz"
      onClick={start}
      disabled={disabled}
    >
      <Mic className="size-5" />
    </Button>
  );
}

// Estado de entrega de mensajes salientes, en español y legible.
const DELIVERY_LABEL: Record<string, string> = {
  sending: "enviando…",
  queued: "en cola",
  sent: "enviado",
  delivered: "entregado",
  read: "leído",
  failed: "no enviado",
};

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
  const router = useRouter();
  const [tab, setTab] = useState<"chats" | "insights">("chats");
  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Realtime: cuando entra o cambia una conversación (webhook → DB), refrescamos
  // la lista sin que el usuario recargue. Debounce para agrupar ráfagas. Respeta
  // RLS: el socket va autenticado y solo trae filas de la empresa del usuario.
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel("inbox:conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        bump,
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Versión siempre fresca de la conversación abierta (ventana 24h, unread,
  // asignación): se deriva de la lista refrescada en cada render, sin efectos.
  const activeConv = selected
    ? (conversations.find((c) => c.id === selected.id) ?? selected)
    : null;

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
              {activeConv ? (
                <Thread
                  key={activeConv.id}
                  conversation={activeConv}
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
            {infoOpen && activeConv?.lead_id && (
              <LeadInfoPanel
                key={activeConv.lead_id}
                leadId={activeConv.lead_id}
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
      <ContactAvatar name={c.participant_name ?? c.participant_handle} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {c.participant_name ??
              c.participant_handle ??
              c.participant_phone_e164 ??
              "Contacto"}
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Realtime: los mensajes nuevos de ESTA conversación aparecen al instante.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox:messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => getMessages(conversation.id).then(setMessages),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

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
    if (!body || !canSend) return;
    // Optimistic update: el mensaje aparece al toque como "enviando…". Si el
    // server confirma, refreshMessages lo reemplaza por el real; si falla, se
    // revierte y le devolvemos el texto al usuario para que no lo pierda.
    const optimistic: InboxMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      direction: "outbound",
      body,
      message_type: "text",
      delivery_status: "sending",
      created_at: new Date().toISOString(),
      sent_by_user_id: currentUserId,
      attachments: [],
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setText("");
    start(async () => {
      const res = await sendMessage(conversation.id, body);
      if (res.ok) {
        refreshMessages();
      } else {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
        setText(body);
        toast.error(res.message);
      }
    });
  }

  // Envío de adjunto (archivo elegido o nota de voz grabada). El caption es el
  // texto actual del composer. Optimista con preview local (objectURL).
  function sendMedia(file: File) {
    if (!canSend) return;
    const caption = text.trim();
    const mime = file.type || "application/octet-stream";
    const kind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("audio/")
        ? "audio"
        : mime.startsWith("video/")
          ? "video"
          : "file";
    const localUrl = URL.createObjectURL(file);
    const optimistic: InboxMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      direction: "outbound",
      body: caption || null,
      message_type: kind,
      delivery_status: "sending",
      created_at: new Date().toISOString(),
      sent_by_user_id: currentUserId,
      attachments: [{ type: kind, payload: { mimeType: mime }, localUrl }],
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setText("");
    start(async () => {
      const fd = new FormData();
      fd.append("file", file);
      if (caption) fd.append("caption", caption);
      const res = await sendAttachment(conversation.id, fd);
      if (res.ok) {
        refreshMessages();
      } else {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
        setText(caption);
        toast.error(res.message);
      }
      URL.revokeObjectURL(localUrl);
    });
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) sendMedia(f);
    e.target.value = "";
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar
            name={conversation.participant_name ?? conversation.participant_handle}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {conversation.participant_name ??
                  conversation.participant_handle ??
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
                    <span className="rounded-full border bg-card px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                {(() => {
                  const out = m.direction === "outbound";
                  const sending = m.delivery_status === "sending";
                  const failed = m.delivery_status === "failed";
                  return (
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm transition-opacity",
                        out
                          ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border bg-card",
                        sending && "opacity-60",
                        failed &&
                          "bg-destructive/10 text-destructive ring-1 ring-destructive/25",
                      )}
                    >
                      {m.body && (
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      )}
                      <MessageAttachments
                        messageId={m.id}
                        attachments={m.attachments}
                        outbound={out}
                      />
                      <div
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px]",
                          failed
                            ? "text-destructive/80"
                            : out
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground",
                        )}
                      >
                        {msgTime(m.created_at)}
                        {out && (
                          <span>· {DELIVERY_LABEL[m.delivery_status] ?? m.delivery_status}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
          <div className="flex w-full items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/*,video/*,audio/*,.pdf,application/pdf"
              onChange={onFilePick}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="Adjuntar archivo"
              onClick={() => fileRef.current?.click()}
              disabled={!canSend}
            >
              <Paperclip className="size-5" />
            </Button>
            <AudioRecorder onRecorded={sendMedia} disabled={!canSend} />
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
              disabled={!canSend}
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
            />
            <Button onClick={send} disabled={!canSend || !text.trim()}>
              Enviar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

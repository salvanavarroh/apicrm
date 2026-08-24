"use client";

import {
  Calculator,
  ChevronLeft,
  Sparkles,
  FileText,
  ImageOff,
  Info,
  Mic,
  Paperclip,
  Pause,
  Play,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";


import { ChannelPill } from "@/components/inbox/channel-pill";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { InboxInsights } from "@/components/inbox/inbox-insights";
import { PresenceToggle } from "@/components/inbox/presence-toggle";
import { LeadInfoPanel } from "@/components/inbox/lead-info-panel";
import { UsedQuotePanel } from "@/components/inbox/used-quote-panel";
import { TemplateSendDialog } from "@/components/inbox/template-send-dialog";
import { WindowCountdown } from "@/components/inbox/window-countdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { needsAudioTranscode, toSendableAudio } from "@/lib/audio-transcode";
import { dayLabel, listTime, msgTime, windowRemaining } from "@/lib/inbox-format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  claimConversation,
  getMessages,
  reassignConversation,
  sendAttachment,
  dismissBotSuggestion,
  getBotSuggestion,
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
  participant_photo_url: string | null;
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

// Formatos aceptados para enviar (intersección WhatsApp ∩ Instagram + audio, que
// se transcodifica a m4a antes de subir). Evita mandar algo que Meta rechace.
const MAX_ATTACH_BYTES = 25 * 1024 * 1024;
const ACCEPT_ATTR = "image/png,image/jpeg,video/mp4,audio/*,application/pdf";
const ALLOWED_EXACT = ["image/png", "image/jpeg", "video/mp4", "application/pdf"];
function fileAllowed(f: File): { ok: boolean; msg?: string } {
  if (f.size === 0) return { ok: false, msg: "El archivo está vacío" };
  if (f.size > MAX_ATTACH_BYTES) return { ok: false, msg: "El archivo supera los 25MB" };
  const base = (f.type || "").split(";")[0].trim();
  if (base.startsWith("audio/")) return { ok: true };
  if (ALLOWED_EXACT.includes(base)) return { ok: true };
  return {
    ok: false,
    msg: "Formato no soportado. Se pueden enviar imágenes JPG/PNG, video MP4, audio o PDF.",
  };
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Clasifica un adjunto para elegir cómo mostrarlo (player, imagen o descarga).
function attachmentKind(a: Attachment): "image" | "audio" | "video" | "file" {
  const t = a.type ?? "";
  const m = a.payload?.mimeType ?? "";
  if (t === "image" || m.startsWith("image/")) return "image";
  if (t === "audio" || m.startsWith("audio/")) return "audio";
  if (t === "video" || m.startsWith("video/")) return "video";
  return "file";
}

// Loader de 3 puntitos estilo WhatsApp mientras carga un adjunto.
function DotsLoader({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label="Cargando">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="wa-dot size-1.5 rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// Popup a pantalla completa para ver imagen/video en grande (portal al body).
function Lightbox({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[92vw]">
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Imagen: placeholder con loader mientras carga; clic → lightbox. La burbuja se
// ajusta al tamaño de la imagen.
function ImageAttachment({ src, outbound }: { src: string; outbound: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  if (error) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
          outbound ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        <ImageOff className="size-3.5" /> Imagen no disponible
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative block w-fit cursor-zoom-in overflow-hidden rounded-lg",
          !loaded && "grid min-h-[140px] min-w-[180px] place-items-center bg-black/5",
        )}
      >
        {!loaded && <DotsLoader className="opacity-70" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Imagen adjunta"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={cn("block max-h-72 max-w-[17.5rem] rounded-lg object-cover", !loaded && "hidden")}
        />
      </button>
      {open && (
        <Lightbox onClose={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain" />
        </Lightbox>
      )}
    </>
  );
}

// Video: primer frame como thumbnail + botón play; clic → lightbox reproduce.
function VideoAttachment({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative block w-fit cursor-pointer overflow-hidden rounded-lg bg-black",
          !ready && "grid min-h-[140px] min-w-[180px] place-items-center",
        )}
      >
        {!ready && <DotsLoader className="text-white/80" />}
        <video
          src={src}
          preload="metadata"
          muted
          onLoadedData={() => setReady(true)}
          className={cn("block max-h-72 max-w-[17.5rem]", !ready && "hidden")}
        />
        {ready && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <Play className="size-6 translate-x-0.5" />
            </span>
          </span>
        )}
      </button>
      {open && (
        <Lightbox onClose={() => setOpen(false)}>
          <video src={src} controls autoPlay className="max-h-[90vh] max-w-[92vw] rounded-lg" />
        </Lightbox>
      )}
    </>
  );
}

// Player de audio custom, look & feel WhatsApp: play/pausa, barra seekable,
// duración. Ancho fijo y cómodo. Arregla la duración Infinity de los webm.
function AudioBubble({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [ready, setReady] = useState(false);

  function onMeta() {
    const a = audioRef.current;
    if (!a) return;
    if (a.duration === Infinity || Number.isNaN(a.duration)) {
      a.currentTime = 1e101; // fuerza el cálculo de la duración en webm
      return;
    }
    setDur(a.duration);
    setReady(true);
  }
  function onTime() {
    const a = audioRef.current;
    if (!a) return;
    if (!ready && a.duration !== Infinity && !Number.isNaN(a.duration)) {
      setDur(a.duration);
      setReady(true);
      a.currentTime = 0;
      return;
    }
    setCur(a.currentTime);
  }
  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }
  function seek(e: ReactMouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !dur) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * dur;
    setCur(a.currentTime);
  }
  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="flex w-[min(72vw,17rem)] items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproducir"}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-current/10 transition-colors hover:bg-current/20"
      >
        {!ready ? (
          <DotsLoader />
        ) : playing ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 translate-x-px" />
        )}
      </button>
      <div
        ref={barRef}
        onClick={seek}
        className="relative h-1 flex-1 cursor-pointer rounded-full bg-current/25"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-current" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-current shadow-sm"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums opacity-70">
        {fmtRecTime(Math.floor(cur > 0 ? cur : dur))}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
      />
    </div>
  );
}

// Adjuntos de un mensaje. El src pega al proxy /api/inbox/media (nunca la URL
// cruda de Zernio) salvo el preview optimista local.
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
        if (kind === "image") return <ImageAttachment key={i} src={src} outbound={outbound} />;
        if (kind === "audio") return <AudioBubble key={i} src={src} />;
        if (kind === "video") return <VideoAttachment key={i} src={src} />;
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
  onRecordingChange,
  disabled,
  className,
}: {
  onRecorded: (f: File) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  function setRec(v: boolean) {
    setRecording(v);
    onRecordingChange?.(v);
  }

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
        setRec(false);
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
      setRec(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("No pudimos acceder al micrófono. Revisá los permisos.");
    }
  }

  if (recording) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-3 py-2",
          className,
        )}
      >
        <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
        <span className="text-sm tabular-nums text-muted-foreground">
          {fmtRecTime(seconds)}
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground">Grabando…</span>
        <button
          type="button"
          title="Descartar"
          onClick={() => {
            cancelledRef.current = true;
            recorderRef.current?.stop();
          }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="size-[18px]" />
        </button>
        <button
          type="button"
          title="Enviar nota de voz"
          onClick={() => recorderRef.current?.stop()}
          className="shrink-0 text-primary transition-opacity hover:opacity-80"
        >
          <Send className="size-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={disabled ? "Borrá el texto para grabar un audio" : "Grabar nota de voz"}
      onClick={start}
      disabled={disabled}
      className={className}
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
  initialConversationId,
  presence,
}: {
  conversations: ConversationListItem[];
  currentUserId: string;
  isPriv: boolean;
  vendors: VendorOption[];
  // Deep-link: abre esta conversación al montar (ej. botón "Abrir en Inbox" del
  // lead). Si no está en la lista cargada, queda sin selección (sin romper).
  initialConversationId?: string | null;
  // Call center: presencia del vendedor (null para roles que no reciben reparto).
  presence?: { available: boolean; activeCount: number } | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"chats" | "insights">("chats");
  // Arranca con la primera conversación abierta: entrar al inbox y ver "Elegí una
  // conversación" es un clic de más en la pantalla donde más se trabaja.
  const [selected, setSelected] = useState<ConversationListItem | null>(() => {
    if (initialConversationId) {
      return conversations.find((c) => c.id === initialConversationId) ?? null;
    }
    return conversations[0] ?? null;
  });
  // En desktop la primera conversación viene abierta (pedido del QA). En mobile
  // eso significaría entrar directo a un chat sin haber visto la lista, así que
  // ahí el chat se muestra sólo cuando el usuario elige una conversación.
  const [openedByUser, setOpenedByUser] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // El cotizador se abre como panel derecho, igual que la info del lead. Los dos
  // son excluyentes: con tres columnas abiertas el chat queda sin ancho útil
  // —que es exactamente lo que pasaba cuando el cotizador vivía sobre el
  // composer y empujaba la lista de conversaciones.
  const [quoteOpen, setQuoteOpen] = useState(false);

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
      <header
        className={cn(
          "flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6",
          openedByUser ? "hidden lg:flex" : "flex",
        )}
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-xs text-muted-foreground">
            Conversaciones de WhatsApp, Instagram y Facebook.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {presence && (
            <PresenceToggle
              initialAvailable={presence.available}
              activeCount={presence.activeCount}
            />
          )}
          {isPriv && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "chats" | "insights")}>
              <TabsList>
                <TabsTrigger value="chats">Conversaciones</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </header>

      {tab === "insights" ? (
        <InboxInsights />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Filtros. Con un chat abierto en mobile se ocultan: son 3 renglones
              de controles sobre 844px de alto, y el chat necesita la pantalla. */}
          <div
            className={cn(
              "flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 sm:px-4",
              openedByUser ? "hidden lg:flex" : "flex",
            )}
          >
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

          {/* 3 paneles en desktop. En mobile es UNA columna: se ve la lista o
              se ve el chat, nunca los dos — 320px de lista sobre 390px de
              pantalla no dejan lugar para nada más. */}
          <div className="flex min-h-0 flex-1">
            {/* Lista */}
            <div
              className={cn(
                "w-full shrink-0 overflow-y-auto border-r bg-muted/20 lg:block lg:w-80",
                openedByUser ? "hidden lg:block" : "block",
              )}
            >
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
                      setOpenedByUser(true);
                      // El panel de info sólo se abre solo en desktop: en mobile
                      // taparía el chat que el usuario acaba de abrir.
                      setInfoOpen(
                        !!c.lead_id &&
                          typeof window !== "undefined" &&
                          window.innerWidth >= 1024,
                      );
                    }}
                  />
                ))
              )}
            </div>

            {/* Chat */}
            <div
              className={cn(
                "min-w-0 flex-1 flex-col bg-background",
                openedByUser ? "flex" : "hidden lg:flex",
              )}
            >
              {activeConv ? (
                <Thread
                  key={activeConv.id}
                  conversation={activeConv}
                  currentUserId={currentUserId}
                  isPriv={isPriv}
                  vendors={vendors}
                  infoOpen={infoOpen}
                  onToggleInfo={() => {
                    setInfoOpen((o) => !o);
                    setQuoteOpen(false);
                  }}
                  onBack={() => setOpenedByUser(false)}
                  quoteOpen={quoteOpen}
                  onToggleQuote={() => {
                    setQuoteOpen((o) => !o);
                    setInfoOpen(false);
                  }}
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
              <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:static lg:z-auto lg:block lg:bg-transparent">
                <LeadInfoPanel
                  key={activeConv.lead_id}
                  leadId={activeConv.lead_id}
                  onClose={() => setInfoOpen(false)}
                />
              </div>
            )}

            {/* Panel del cotizador. El mensaje enviado aparece en el hilo por la
                suscripción realtime, sin necesidad de refrescar a mano. */}
            {quoteOpen && activeConv && (
              <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:static lg:z-auto lg:block lg:bg-transparent">
                <UsedQuotePanel
                  key={activeConv.id}
                  conversationId={activeConv.id}
                  leadId={activeConv.lead_id ?? null}
                  onClose={() => setQuoteOpen(false)}
                />
              </div>
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
      data-conversation-row
      className={cn(
        "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
        active && "bg-card shadow-sm",
      )}
    >
      <ContactAvatar
        name={c.participant_name ?? c.participant_handle}
        photoUrl={c.participant_photo_url}
        size="md"
      />
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
  vendors,
  infoOpen,
  onToggleInfo,
  quoteOpen,
  onToggleQuote,
  onBack,
  onClaimed,
}: {
  conversation: ConversationListItem;
  currentUserId: string;
  isPriv: boolean;
  vendors: VendorOption[];
  infoOpen: boolean;
  onToggleInfo: () => void;
  quoteOpen: boolean;
  onToggleQuote: () => void;
  /** Vuelve a la lista. Sólo se usa en mobile. */
  onBack: () => void;
  onClaimed: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [text, setText] = useState("");
  // Sugerencia del bot en modo borrador: el bot no la mandó, la propone para que
  // el asesor la revise y la envíe con un clic (o la edite antes).
  const [suggestion, setSuggestion] = useState<{
    id: string;
    reply: string;
    matchedBy: string | null;
  } | null>(null);
  const [pending, start] = useTransition();
  const [staged, setStaged] = useState<{ file: File; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isMine = conversation.assigned_user_id === currentUserId;
  const isPool = !conversation.assigned_user_id;
  const canSend = isMine || isPriv;
  const win = windowRemaining(conversation.window_expires_at);

  useEffect(() => {
    getMessages(conversation.id).then(setMessages);
    // La sugerencia del bot se pide junto con los mensajes: si el asesor ya
    // respondió después, la action devuelve null y no se muestra nada.
    // La sugerencia se carga COMO BORRADOR en el composer. Antes era una tarjeta
    // aparte con borde naranja y sus propios botones, y se leía como un error
    // (así lo reportó el QA). Puesta en el mismo input, con el mismo botón de
    // Enviar, se entiende sola: es un texto propuesto que se puede editar.
    getBotSuggestion(conversation.id).then((sug) => {
      setSuggestion(sug);
      if (sug) setText((t) => (t.trim() ? t : sug.reply));
    });
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
  // Reasignar/transferir a otro vendedor (solo privilegiados).
  function reassign(toUserId: string) {
    if (!toUserId || toUserId === conversation.assigned_user_id) return;
    start(async () => {
      const res = await reassignConversation(conversation.id, toUserId);
      if (res.ok) {
        toast.success("Conversación reasignada");
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
        setSuggestion(null);
      } else {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
        setText(body);
        toast.error(res.message);
      }
    });
  }

  // Envío de adjunto (archivo elegido o nota de voz grabada). El caption es el
  // texto actual del composer. Optimista con preview local (objectURL). El audio
  // se transcodifica a m4a/AAC (compatible WhatsApp + Instagram) antes de subir.
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
    const revert = () => {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
      setText(caption);
      URL.revokeObjectURL(localUrl);
    };
    start(async () => {
      let toSend = file;
      if (kind === "audio" && needsAudioTranscode(mime)) {
        const tid = toast.loading("Preparando audio…");
        try {
          toSend = await toSendableAudio(file);
        } catch {
          toast.dismiss(tid);
          toast.error("No se pudo preparar el audio para enviar");
          revert();
          return;
        }
        toast.dismiss(tid);
      }
      const fd = new FormData();
      fd.append("file", toSend);
      if (caption) fd.append("caption", caption);
      const res = await sendAttachment(conversation.id, fd);
      if (res.ok) {
        refreshMessages();
        URL.revokeObjectURL(localUrl);
      } else {
        toast.error(res.message);
        revert();
      }
    });
  }

  // Elegir un archivo NO lo envía: queda "staged" para mandarlo con un mensaje.
  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const check = fileAllowed(f);
    if (!check.ok) {
      toast.error(check.msg!);
      return;
    }
    if (staged) URL.revokeObjectURL(staged.url);
    setStaged({ file: f, url: URL.createObjectURL(f) });
  }

  function removeStaged() {
    if (staged) URL.revokeObjectURL(staged.url);
    setStaged(null);
  }

  // Enviar: si hay archivo staged, va el archivo (con el texto como caption);
  // si no, va el mensaje de texto.
  function onSend() {
    if (staged) {
      const f = staged.file;
      URL.revokeObjectURL(staged.url);
      setStaged(null);
      sendMedia(f);
    } else {
      send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* En mobile el chat ocupa toda la pantalla: sin esto no hay forma de
              volver a la lista de conversaciones. */}
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a las conversaciones"
            className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <ChevronLeft className="size-5" />
          </button>
          <ContactAvatar
            name={conversation.participant_name ?? conversation.participant_handle}
            photoUrl={conversation.participant_photo_url}
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
        {/* En mobile las acciones van en su propia fila y scrollean: en 390px
            no entran el contador de ventana, Plantilla, Cotizar e Info en la
            misma línea que el nombre del contacto — se superponían. */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:justify-end sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
          <WindowCountdown expiresAt={conversation.window_expires_at} />
          {isPriv && vendors.length > 0 && (
            <select
              value={conversation.assigned_user_id ?? ""}
              onChange={(e) => reassign(e.target.value)}
              disabled={pending}
              title="Reasignar a otro vendedor"
              aria-label="Reasignar a otro vendedor"
              className="h-8 max-w-[9rem] rounded-md border bg-background px-2 text-sm text-muted-foreground disabled:opacity-50"
            >
              <option value="" disabled>
                Reasignar…
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
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
            variant={quoteOpen ? "default" : "outline"}
            onClick={onToggleQuote}
          >
            <Calculator className="mr-1 size-4" /> Cotizar
          </Button>
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
                  // Saliente sin usuario del CRM = enviado desde el teléfono
                  // (app de WhatsApp / Business Suite), capturado por coexistencia.
                  const fromPhone = out && !m.sent_by_user_id;
                  return (
                    <div
                      className={cn(
                        "w-fit max-w-[75%] rounded-2xl px-3 py-2 text-sm transition-opacity",
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
                        {fromPhone && <span>desde WhatsApp ·</span>}
                        {msgTime(m.created_at)}
                        {out && !fromPhone && (
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
      {/* Sin alto fijo: el textarea crece hasta 5 renglones. El h-[68px] de
          antes era lo que hacía que cualquier cosa más alta se desbordara sobre
          los mensajes. */}
      <div className="flex min-h-[68px] shrink-0 items-center border-t bg-card px-3 py-2.5">
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
          <div className="flex w-full flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              hidden
              accept={ACCEPT_ATTR}
              onChange={onFilePick}
            />

            {/* Sugerencia del asistente: misma caja, mismos colores, un solo CTA
                (el "Enviar" de siempre). Sin borde de alerta: no es un error. */}
            {suggestion && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Sparkles className="size-3 shrink-0 text-accent" />
                <span className="min-w-0 truncate">
                  Sugerencia del asistente
                  {suggestion.matchedBy === "blacklist" &&
                    " · preguntó por precio, se deriva"}
                  {suggestion.matchedBy === "none" &&
                    " · no reconoció la pregunta"}
                  . Editala o mandala como está.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const id = suggestion.id;
                    setSuggestion(null);
                    setText("");
                    void dismissBotSuggestion(id);
                  }}
                  className="ml-auto shrink-0 hover:text-foreground"
                >
                  Descartar
                </button>
              </div>
            )}
            {/* Archivo adjunto listo para enviar (con un mensaje opcional). */}
            {staged && !recording && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 p-2">
                {staged.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={staged.url} alt="" className="size-10 shrink-0 rounded object-cover" />
                ) : staged.file.type.startsWith("video/") ? (
                  <video src={staged.url} muted className="size-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded bg-background">
                    <Paperclip className="size-4 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{staged.file.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {fmtSize(staged.file.size)} · listo para enviar
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeStaged}
                  title="Quitar"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              {!recording && (
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
              )}
              <AudioRecorder
                onRecorded={sendMedia}
                onRecordingChange={setRecording}
                disabled={!canSend || text.trim().length > 0 || !!staged}
                className={recording ? "flex-1" : undefined}
              />
              {!recording && (
                <>
                  {/* Textarea y no input: con un renglón sólo había que moverse
                      con las flechas para releer lo escrito. Crece hasta 5
                      renglones y después scrollea. Enter sigue enviando;
                      Shift+Enter hace salto de línea. */}
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    placeholder={
                      staged
                        ? "Agregá un mensaje (opcional)…"
                        : canSend
                          ? "Escribí un mensaje…"
                          : "Sólo el dueño responde"
                    }
                    disabled={!canSend}
                    className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                  />
                  <Button onClick={onSend} disabled={!canSend || (!text.trim() && !staged)}>
                    Enviar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Calendar, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

// ============================================================================
// Selector de fecha y hora propio.
//
// Reemplaza a `<input type="date|time|datetime-local">`. El nativo tenía dos
// problemas concretos:
//   · En iOS abre una ruleta a pantalla completa que no respeta min/max y que
//     en un teléfono tapa el formulario entero; en Android cada fabricante
//     dibuja otra cosa. Nunca se ve como el resto de la app.
//   · El ancho del control lo decide el navegador: los `w-40` de los filtros
//     quedaban cortados en Safari y era una de las fuentes de scroll lateral.
//
// Este componente habla el mismo idioma que el nativo —el valor sigue siendo
// `YYYY-MM-DD`, `HH:mm` o `YYYY-MM-DDTHH:mm`— así que se cambia el import y
// nada más. En pantallas chicas el panel entra como hoja desde abajo, con
// objetivos táctiles de 40px; en desktop es un popover anclado al disparador.
// ============================================================================

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** `YYYY-MM-DD` → Date local (evita el corrimiento de un día que produce
 *  `new Date("2026-08-25")`, que se parsea como UTC). */
function parseISODate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDisplay(v: string): string {
  const d = parseISODate(v);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Lunes = 0. `getDay()` devuelve domingo = 0, que no es como se lee un
 *  calendario en Argentina. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}

// ---------------------------------------------------------------------------
// Panel: hoja desde abajo en mobile, popover anclado en desktop.
//
// Dentro de un diálogo NO se usa portal: Radix pone `pointer-events: none` en
// el body, cierra el diálogo ante cualquier pointerdown fuera de su contenido y
// bloquea el scroll del resto de la página. Un panel colgado de `document.body`
// quedaría muerto. Adentro del diálogo se dibuja en el flujo, absoluto respecto
// del disparador, y se corre para no salirse del cuadro.
// ---------------------------------------------------------------------------

function Panel({
  anchor,
  title,
  onClose,
  children,
  footer,
}: {
  anchor: HTMLElement | null;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const [inlineLeft, setInlineLeft] = React.useState(0);

  const dialogBox =
    anchor?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null;
  const inline = dialogBox !== null;

  // Posición en desktop: debajo del disparador, corrida hacia adentro si no
  // entra. Se recalcula al scrollear porque el panel es `fixed`.
  React.useEffect(() => {
    if (inline || isMobile || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = ref.current?.offsetWidth ?? 300;
      const h = ref.current?.offsetHeight ?? 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const below = r.bottom + 6;
      const top =
        below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, inline, isMobile]);

  // Dentro de un diálogo el panel es absoluto: alcanza con correrlo en X para
  // que no se pase del borde del cuadro.
  React.useEffect(() => {
    if (!inline || !anchor || !dialogBox) return;
    const el = ref.current;
    if (!el) return;
    const wrap = anchor.getBoundingClientRect();
    const box = dialogBox.getBoundingClientRect();
    const w = el.offsetWidth;
    let left = 0;
    if (wrap.left + w > box.right - 12) left = box.right - 12 - w - wrap.left;
    if (wrap.left + left < box.left + 12) left = box.left + 12 - wrap.left;
    setInlineLeft(left);
    // El diálogo scrollea por dentro: si el calendario se abre contra el borde
    // de abajo queda cortado y no se ve ni la mitad del mes.
    el.scrollIntoView({ block: "nearest" });
  }, [anchor, dialogBox, inline]);

  // Cerrar con Escape y al tocar fuera.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [anchor, onClose]);

  const body = (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      // `pointer-events-auto` porque Radix apaga los eventos del body mientras
      // hay un diálogo abierto; el stopPropagation evita que ese mismo diálogo
      // se cierre al tocar el calendario.
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "bg-popover text-popover-foreground pointer-events-auto z-[70] rounded-xl border shadow-lg",
        inline
          ? "absolute top-full left-0 z-50 mt-1 w-max"
          : isMobile
            ? "fixed inset-x-0 bottom-0 max-h-[85svh] overflow-y-auto rounded-b-none pb-[env(safe-area-inset-bottom)]"
            : "fixed w-max",
      )}
      style={
        inline
          ? { marginLeft: inlineLeft }
          : isMobile
            ? undefined
            : { top: pos?.top ?? -9999, left: pos?.left ?? -9999 }
      }
    >
      {isMobile && !inline && (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground hover:bg-muted rounded-md p-1.5"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className={cn("p-3", isMobile && !inline && "flex justify-center")}>
        {children}
      </div>
      {footer && <div className="border-t p-2">{footer}</div>}
    </div>
  );

  if (inline) return body;

  return createPortal(
    <>
      {isMobile && (
        <div
          className="pointer-events-auto fixed inset-0 z-[69] bg-black/40"
          aria-hidden
        />
      )}
      {body}
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

function MonthGrid({
  selected,
  min,
  max,
  onPick,
}: {
  selected: Date | null;
  min?: Date | null;
  max?: Date | null;
  onPick: (d: Date) => void;
}) {
  const today = React.useMemo(() => new Date(), []);
  const [cursor, setCursor] = React.useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const lead = mondayIndex(firstOfMonth);

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const outOfRange = (d: Date) =>
    (min != null && d < min) || (max != null && d > max);

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="flex w-[17.5rem] max-w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Mes anterior"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 items-center justify-center rounded-md"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold capitalize">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Mes siguiente"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 items-center justify-center rounded-md"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="text-muted-foreground flex h-7 items-center justify-center text-[11px] font-medium"
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={i} className="size-9" />
          ) : (
            <button
              key={i}
              type="button"
              disabled={outOfRange(d)}
              onClick={() => onPick(d)}
              aria-current={
                selected && sameDay(d, selected) ? "date" : undefined
              }
              className={cn(
                "flex size-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-30",
                selected && sameDay(d, selected)
                  ? "bg-accent text-accent-foreground font-semibold"
                  : sameDay(d, today)
                    ? "border-accent/60 text-accent hover:bg-muted border font-semibold"
                    : "hover:bg-muted",
              )}
            >
              {d.getDate()}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columnas de hora
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = [
  "00",
  "05",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
];

function TimeColumns({
  value,
  onChange,
}: {
  /** `HH:mm` o "" */
  value: string;
  onChange: (v: string) => void;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];

  const set = (nh: string, nm: string) => onChange(`${nh}:${nm}`);

  return (
    <div className="flex gap-2">
      <TimeList
        label="Hora"
        items={HOURS}
        selected={h}
        onSelect={(v) => set(v, m || "00")}
      />
      <TimeList
        label="Min"
        items={MINUTES}
        selected={m}
        onSelect={(v) => set(h || "09", v)}
      />
    </div>
  );
}

function TimeList({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Al abrir, el valor elegido tiene que quedar a la vista. Se ajusta el
  // scroll de la lista a mano: `scrollIntoView` acá arrastraba la página.
  React.useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>("[data-selected]");
    if (!box || !el) return;
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium">
        {label}
      </span>
      <div
        ref={ref}
        className="h-[11.25rem] w-full overflow-y-auto rounded-md border p-1"
      >
        {items.map((it) => (
          <button
            key={it}
            type="button"
            data-selected={selected === it ? "" : undefined}
            onClick={() => onSelect(it)}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors",
              selected === it
                ? "bg-accent text-accent-foreground font-semibold"
                : "hover:bg-muted",
            )}
          >
            {it}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disparador compartido
// ---------------------------------------------------------------------------

const TRIGGER_CLS =
  "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-left shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

const TRIGGER_SIZE = { default: "h-9 text-sm", sm: "h-8 text-xs" } as const;

export type PickerSize = keyof typeof TRIGGER_SIZE;

function Trigger({
  icon: Icon,
  text,
  placeholder,
  onClear,
  className,
  size = "default",
  panel,
  ...props
}: React.ComponentProps<"button"> & {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  placeholder: string;
  onClear?: () => void;
  size?: PickerSize;
  /** El panel se cuelga acá adentro: cuando el selector vive en un diálogo se
   *  dibuja en el flujo, posicionado contra este contenedor. */
  panel?: React.ReactNode;
}) {
  return (
    <span className={cn("relative flex min-w-0", className)}>
      <button
        type="button"
        className={cn(
          TRIGGER_CLS,
          TRIGGER_SIZE[size],
          onClear && text && "pr-8",
        )}
        {...props}
      >
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span className={cn("truncate", !text && "text-muted-foreground")}>
          {text || placeholder}
        </span>
      </button>
      {onClear && text && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5"
        >
          <X className="size-3.5" />
        </button>
      )}
      {panel}
    </span>
  );
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  size,
  ariaLabel,
  placeholder = "dd/mm/aaaa",
  clearable = true,
  id,
}: {
  /** `YYYY-MM-DD` o "" */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  size?: PickerSize;
  ariaLabel?: string;
  placeholder?: string;
  clearable?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // El disparador se guarda como estado (no como ref) para que el panel se
  // re-posicione en cuanto el nodo existe.
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);

  const selected = parseISODate(value);

  return (
    <>
      <Trigger
        ref={setAnchor}
        id={id}
        icon={Calendar}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        text={formatDisplay(value)}
        placeholder={placeholder}
        onClear={clearable ? () => onChange("") : undefined}
        className={className}
        panel={
          open ? (
            <Panel
              anchor={anchor}
              title="Elegir fecha"
              onClose={() => setOpen(false)}
              footer={
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(toISODate(new Date()));
                      setOpen(false);
                    }}
                    className="text-accent hover:bg-accent/10 rounded-md px-2.5 py-1.5 text-xs font-medium"
                  >
                    Hoy
                  </button>
                  {clearable && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange("");
                        setOpen(false);
                      }}
                      className="text-muted-foreground hover:bg-muted rounded-md px-2.5 py-1.5 text-xs font-medium"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              }
            >
              <MonthGrid
                selected={selected}
                min={parseISODate(min)}
                max={parseISODate(max)}
                onPick={(d) => {
                  onChange(toISODate(d));
                  setOpen(false);
                }}
              />
            </Panel>
          ) : null
        }
      />
    </>
  );
}

export function TimePicker({
  value,
  onChange,
  disabled,
  className,
  size,
  ariaLabel,
  placeholder = "--:--",
  id,
}: {
  /** `HH:mm` o "" */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  size?: PickerSize;
  ariaLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // El disparador se guarda como estado (no como ref) para que el panel se
  // re-posicione en cuanto el nodo existe.
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);

  return (
    <>
      <Trigger
        ref={setAnchor}
        id={id}
        icon={Clock}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        text={value}
        placeholder={placeholder}
        onClear={() => onChange("")}
        className={className}
        panel={
          open ? (
            <Panel
              anchor={anchor}
              title="Elegir horario"
              onClose={() => setOpen(false)}
              footer={
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-accent hover:bg-accent/10 rounded-md px-2.5 py-1.5 text-xs font-medium"
                  >
                    Listo
                  </button>
                </div>
              }
            >
              <div className="w-[13rem] max-w-full">
                <TimeColumns value={value} onChange={onChange} />
              </div>
            </Panel>
          ) : null
        }
      />
    </>
  );
}

export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  size,
  ariaLabel,
  placeholder = "dd/mm/aaaa --:--",
  id,
}: {
  /** `YYYY-MM-DDTHH:mm` o "" */
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  size?: PickerSize;
  ariaLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // El disparador se guarda como estado (no como ref) para que el panel se
  // re-posicione en cuanto el nodo existe.
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);

  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const time = (timePart ?? "").slice(0, 5);
  const selected = parseISODate(datePart);

  const emit = (d: string, t: string) => {
    if (!d) {
      onChange("");
      return;
    }
    onChange(`${d}T${t || "09:00"}`);
  };

  const text = datePart
    ? `${formatDisplay(datePart)}${time ? ` · ${time}` : ""}`
    : "";

  return (
    <>
      <Trigger
        ref={setAnchor}
        id={id}
        icon={Calendar}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        text={text}
        placeholder={placeholder}
        onClear={() => onChange("")}
        className={className}
        panel={
          open ? (
            <Panel
              anchor={anchor}
              title="Elegir fecha y hora"
              onClose={() => setOpen(false)}
              footer={
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => emit(toISODate(new Date()), time || "09:00")}
                    className="text-accent hover:bg-accent/10 rounded-md px-2.5 py-1.5 text-xs font-medium"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-accent hover:bg-accent/10 rounded-md px-2.5 py-1.5 text-xs font-medium"
                  >
                    Listo
                  </button>
                </div>
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <MonthGrid
                  selected={selected}
                  min={parseISODate(min)}
                  max={parseISODate(max)}
                  onPick={(d) => emit(toISODate(d), time)}
                />
                <div className="w-full sm:w-[11rem]">
                  <TimeColumns
                    value={time}
                    onChange={(t) => emit(datePart || toISODate(new Date()), t)}
                  />
                </div>
              </div>
            </Panel>
          ) : null
        }
      />
    </>
  );
}

/** Campo etiquetado: es el patrón que repiten las barras de filtros. */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-muted-foreground text-[11px] font-medium">
        {label}
      </span>
      {/* `ariaLabel` porque el disparador es un <button>: el <span> de arriba
          no le da nombre accesible como se lo daba un <label> a un <input>. */}
      <DatePicker
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        ariaLabel={label}
      />
    </div>
  );
}

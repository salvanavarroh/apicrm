"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { type TaskType } from "@/lib/tasks";

export type AgendaItem = {
  id: string;
  kind: "task" | "visit";
  /** Fecha de calendario en formato YYYY-MM-DD (zona local). */
  dateKey: string;
  /** ISO completo para visitas (con hora) o null para tasks. */
  scheduledAt: string | null;
  /** Horario "HH:MM" de la tarea (opcional). Las visitas usan scheduledAt. */
  time?: string | null;
  title: string;
  taskType: TaskType | null;
  leadId: string;
  leadName: string;
  href: string;
  done: boolean;
};

type Props = {
  items: AgendaItem[];
  /** YYYY-MM-DD del día "hoy" calculado server-side para evitar mismatch SSR. */
  todayKey: string;
};

const DAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function AgendaCalendar({ items, todayKey }: Props) {
  // El mes mostrado arranca en el mes de `todayKey`.
  const [year, month] = useMemo(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return [y, m];
  }, [todayKey]);
  const [view, setView] = useState({ year, month });
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      const arr = map.get(it.dateKey) ?? [];
      arr.push(it);
      map.set(it.dateKey, arr);
    }
    return map;
  }, [items]);

  const grid = useMemo(
    () => buildMonthGrid(view.year, view.month),
    [view],
  );

  const selectedItems = useMemo(() => {
    const arr = itemsByDate.get(selectedKey) ?? [];
    // Orden por horario del día: tareas y visitas con hora se intercalan por
    // su hora; lo que no tiene hora va al final.
    return [...arr].sort((a, b) => {
      const ma = minutesOfDay(a);
      const mb = minutesOfDay(b);
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return ma - mb;
    });
  }, [itemsByDate, selectedKey]);

  function navMonth(delta: number) {
    setView((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      return { year: y, month: m };
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-accent" />
          Agenda
        </CardTitle>
        <Link
          href="?"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {/* el padre decide cómo navegar a tasks-visits */}
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 lg:flex-row">
        {/* Mini calendar */}
        <div className="lg:w-72 lg:shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {MONTH_NAMES[view.month - 1]} {view.year}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navMonth(-1)}
                className="rounded p-1 hover:bg-muted"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navMonth(1)}
                className="rounded p-1 hover:bg-muted"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
            {DAY_HEADERS.map((d, i) => (
              <div key={i} className="py-1 font-semibold">
                {d}
              </div>
            ))}
            {grid.map((cell, idx) => {
              const dayItems = cell ? (itemsByDate.get(cell.key) ?? []) : [];
              const isToday = cell?.key === todayKey;
              const isSelected = cell?.key === selectedKey;
              const taskCount = dayItems.filter(
                (i) => i.kind === "task" && !i.done,
              ).length;
              const visitCount = dayItems.filter(
                (i) => i.kind === "visit",
              ).length;
              return (
                <button
                  key={cell?.key ?? `empty-${idx}`}
                  type="button"
                  disabled={!cell}
                  onClick={() => cell && setSelectedKey(cell.key)}
                  className={
                    !cell
                      ? "h-9 rounded"
                      : isSelected
                        ? "flex h-9 flex-col items-center justify-center rounded bg-accent text-[11px] font-semibold text-accent-foreground"
                        : isToday
                          ? "flex h-9 flex-col items-center justify-center rounded border border-accent/40 text-[11px] font-semibold text-foreground hover:bg-muted"
                          : "flex h-9 flex-col items-center justify-center rounded text-[11px] text-foreground hover:bg-muted"
                  }
                >
                  {cell && <span>{cell.day}</span>}
                  {cell && (taskCount > 0 || visitCount > 0) ? (
                    <div className="flex items-center gap-0.5">
                      {taskCount > 0 && (
                        <span
                          className={
                            isSelected
                              ? "size-1 rounded-full bg-accent-foreground/80"
                              : "size-1 rounded-full bg-blue-500"
                          }
                          aria-label={`${taskCount} tareas`}
                        />
                      )}
                      {visitCount > 0 && (
                        <span
                          className={
                            isSelected
                              ? "size-1 rounded-full bg-accent-foreground/80"
                              : "size-1 rounded-full bg-accent"
                          }
                          aria-label={`${visitCount} visitas`}
                        />
                      )}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-blue-500" /> Tarea
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-accent" /> Visita
            </span>
          </div>
        </div>

        {/* Items del día seleccionado */}
        <div className="flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {formatHeader(selectedKey, todayKey)}
          </p>
          {selectedItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card py-10 text-center">
              <ListChecks className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Sin tareas ni visitas para este día.
              </p>
            </div>
          ) : (
            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
              {selectedItems.map((item) => (
                <AgendaItemCard key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Minuto del día (0–1439) del item, o null si no tiene horario.
function minutesOfDay(it: AgendaItem): number | null {
  if (it.scheduledAt) {
    const d = new Date(it.scheduledAt);
    if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }
  if (it.time) {
    const [h, m] = it.time.split(":").map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) return h * 60 + m;
  }
  return null;
}

function AgendaItemCard({ item }: { item: AgendaItem }) {
  const time = item.scheduledAt
    ? formatTime(item.scheduledAt)
    : (item.time ?? null);
  return (
    <Link
      href={item.href}
      className="flex items-start gap-3 rounded-md border bg-card p-2.5 hover:bg-muted/40"
    >
      <span
        aria-hidden
        className={
          item.kind === "visit"
            ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
            : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500"
        }
      >
        {item.kind === "visit" ? (
          <CalendarDays className="size-3.5" />
        ) : (
          <Circle className="size-3.5" />
        )}
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <p
            className={
              item.done
                ? "text-sm text-muted-foreground line-through"
                : "text-sm font-medium text-foreground"
            }
          >
            {item.title}
          </p>
          {time && (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {time}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{item.leadName}</p>
      </div>
    </Link>
  );
}

function buildMonthGrid(
  year: number,
  month: number,
): Array<{ day: number; key: string } | null> {
  // Lunes-primer-día (locale es). getDay() devuelve 0=domingo, 1=lunes...
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // 0=lunes
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // `hour12: false` no es un gusto: en 12 horas el separador de "a. m." sale
  // como espacio angosto en Chrome y como espacio común en Node, y React tira
  // un error de hidratación que rehace todo el árbol en el cliente. Además en
  // Argentina la hora se escribe en 24.
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHeader(key: string, todayKey: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (key === todayKey) return `Hoy · ${d}/${m}/${y}`;
  return `${d}/${String(m).padStart(2, "0")}/${y}`;
}

export {};

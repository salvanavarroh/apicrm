"use client";

// ============================================================================
// Las conversaciones anteriores.
//
// Guardar la charla no alcanza si después no hay cómo volver a ella. El listado
// sale de la base (RLS: sólo las propias) y no del navegador, así que sigue
// estando si cambiás de máquina.
// ============================================================================

import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

type Thread = { id: string; title: string | null; created_at: string };

function cuando(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia =
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
  return mismoDia
    ? `Hoy ${d.toTimeString().slice(0, 5)}`
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function ThreadList({
  activeId,
  onPick,
  onBack,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const [threads, setThreads] = useState<Thread[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/assistant/threads")
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((d: { threads: Thread[] }) => {
        if (!cancelado) setThreads(d.threads ?? []);
      })
      .catch(() => {
        if (!cancelado) setThreads([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver
      </button>

      <p className="text-sm font-semibold">Conversaciones</p>

      {threads === null && (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Cargando…
        </span>
      )}

      {threads?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay conversaciones guardadas.
        </p>
      )}

      {threads?.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={
            "flex flex-col gap-0.5 rounded-md border p-2.5 text-left transition-colors hover:border-accent" +
            (t.id === activeId ? " border-accent bg-accent/5" : "")
          }
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="line-clamp-1">{t.title ?? "Sin título"}</span>
          </span>
          <span className="pl-5 text-xs text-muted-foreground">
            {cuando(t.created_at)}
            {t.id === activeId ? " · abierta" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

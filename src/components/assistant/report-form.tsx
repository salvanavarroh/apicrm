"use client";

// ============================================================================
// Formulario de reporte de problemas.
//
// Dos campos, y sólo uno obligatorio. Todo lo que hace útil a un reporte —la
// pantalla, el rol, la empresa, el navegador, el hilo de la conversación— lo
// captura el servidor. Pedírselo al usuario sería garantizar que nadie reporte.
// ============================================================================

import { ArrowLeft, Bug, Check, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { reportProblem } from "@/lib/assistant/report-actions";

export function ReportForm({
  threadId,
  initialText,
  onBack,
}: {
  threadId: string | null;
  initialText?: string;
  onBack: () => void;
}) {
  const pathname = usePathname();
  const [whatHappened, setWhatHappened] = useState(initialText ?? "");
  const [expected, setExpected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await reportProblem({
        whatHappened,
        expected,
        route: pathname,
        threadId: threadId ?? undefined,
        userAgent:
          typeof navigator === "undefined" ? undefined : navigator.userAgent,
      });
      if (res.ok) setSent(true);
      else setError(res.message);
    });
  }

  if (sent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-5" />
        </div>
        <p className="text-sm font-semibold">Reporte enviado</p>
        <p className="text-sm text-muted-foreground">
          Ya nos llegó con la pantalla en la que estabas y tu rol. Si hace falta
          más info te escribimos.
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Volver al asistente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver al asistente
      </button>

      <div className="flex items-center gap-2">
        <Bug className="size-4 text-accent" />
        <p className="text-sm font-semibold">Reportar un problema</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rep-what">¿Qué pasó?</Label>
        <textarea
          id="rep-what"
          rows={4}
          maxLength={2000}
          autoFocus
          value={whatHappened}
          onChange={(e) => setWhatHappened(e.target.value)}
          placeholder="Al generar el presupuesto el PDF sale en blanco…"
          className="resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rep-expected">
          ¿Qué esperabas que pasara?{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <textarea
          id="rep-expected"
          rows={3}
          maxLength={2000}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="Que se descargue el PDF con los datos del lead."
          className="resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
        Se manda solo: la pantalla donde estás (
        <code className="font-mono">{pathname}</code>), tu rol, tu concesionaria y
        el navegador. No hace falta que lo escribas.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button onClick={submit} disabled={pending || whatHappened.trim().length < 10}>
        {pending && <Loader2 className="animate-spin" />}
        Enviar reporte
      </Button>
    </div>
  );
}

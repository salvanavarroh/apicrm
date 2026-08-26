"use client";

// ============================================================================
// El chat de la página de Ayuda, con el mismo cambio a "reportar un problema"
// que tiene el riel. Es la página de ayuda: si el asistente no puede, el paso
// siguiente tiene que estar acá y no en otra pantalla.
// ============================================================================

import { useState } from "react";

import {
  AssistantChat,
  type Suggestion,
} from "@/components/assistant/assistant-chat";
import { ReportForm } from "@/components/assistant/report-form";

type Mode =
  | { kind: "chat" }
  | { kind: "report"; threadId: string | null; text: string };

export function AyudaPanel({
  suggestions,
  greeting,
}: {
  suggestions: Suggestion[];
  greeting: string;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "chat" });

  if (mode.kind === "report") {
    return (
      <div className="flex flex-col rounded-lg border bg-card">
        <ReportForm
          threadId={mode.threadId}
          initialText={mode.text}
          onBack={() => setMode({ kind: "chat" })}
        />
      </div>
    );
  }

  return (
    <AssistantChat
      variant="page"
      suggestions={suggestions}
      greeting={greeting}
      onReport={(ctx) =>
        setMode({ kind: "report", threadId: ctx.threadId, text: ctx.question })
      }
    />
  );
}

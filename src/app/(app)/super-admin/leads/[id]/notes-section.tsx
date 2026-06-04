"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/leads";

import { addCommercialLeadNote } from "../actions";

type Note = {
  id: string;
  content: string;
  created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
};

export function CommercialNotesSection({
  leadId,
  notes,
}: {
  leadId: string;
  notes: Note[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [items, setItems] = useState<Note[]>(notes);
  const [lastSynced, setLastSynced] = useState(notes);

  if (notes !== lastSynced) {
    setLastSynced(notes);
    setItems(notes);
  }

  function submit() {
    if (!content.trim()) return;
    const snapshot = content;
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`;
    const optimistic: Note = {
      id: tempId,
      content: snapshot.trim(),
      created_at: new Date().toISOString(),
      author: null,
    };
    setItems((prev) => [optimistic, ...prev]);
    setContent("");
    startTransition(async () => {
      const r = await addCommercialLeadNote(leadId, snapshot);
      if (!r.ok) {
        toast.error(r.message);
        setItems((prev) => prev.filter((n) => n.id !== tempId));
        setContent(snapshot);
        return;
      }
      setItems((prev) =>
        prev.map((n) => (n.id === tempId ? { ...n, id: r.noteId } : n)),
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Seguimiento</CardTitle>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "nota" : "notas"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Textarea
            rows={3}
            placeholder="Anotá qué hablaste, próximos pasos, objeciones…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={pending}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={pending || !content.trim()}
            >
              {pending ? "Guardando…" : "Agregar nota"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin notas todavía. Dejá registro de cada contacto.
            </p>
          )}
          {items.map((note) => (
            <div
              key={note.id}
              className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5 text-sm"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {note.author
                    ? fullName(note.author.first_name, note.author.last_name)
                    : "—"}
                </span>
                <span>
                  {new Date(note.created_at).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p className="whitespace-pre-line text-foreground">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/leads";

import { addLeadNote } from "@/app/(app)/admin/leads/actions";

export type LeadNote = {
  id: string;
  content: string;
  created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
};

type Props = {
  leadId: string;
  notes: LeadNote[];
  readonly?: boolean;
};

export function NotesSection({ leadId, notes, readonly }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [items, setItems] = useState<LeadNote[]>(notes);
  const [lastSynced, setLastSynced] = useState(notes);

  if (notes !== lastSynced) {
    setLastSynced(notes);
    setItems(notes);
  }

  function submit() {
    if (!content.trim()) return;
    const tempId = `tmp_${Date.now()}`;
    const snapshot = content;
    const optimistic: LeadNote = {
      id: tempId,
      content: snapshot.trim(),
      created_at: new Date().toISOString(),
      author: null,
    };
    setItems((prev) => [optimistic, ...prev]);
    setContent("");

    startTransition(async () => {
      const result = await addLeadNote(leadId, snapshot);
      if (!result.ok) {
        toast.error(result.message);
        setItems((prev) => prev.filter((n) => n.id !== tempId));
        setContent(snapshot);
        return;
      }
      setItems((prev) =>
        prev.map((n) => (n.id === tempId ? { ...n, id: result.noteId } : n)),
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Notas internas</CardTitle>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "nota" : "notas"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!readonly && (
          <div className="flex flex-col gap-2">
            <Textarea
              rows={2}
              placeholder="Escribí una nota interna…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={pending}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={pending || !content.trim()}>
                {pending ? "Guardando…" : "Agregar nota"}
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin notas
            </p>
          )}
          {items.map((note) => (
            <div
              key={note.id}
              className="rounded-md bg-muted px-3 py-2 text-sm"
            >
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
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
              <p className="whitespace-pre-line">{note.content}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

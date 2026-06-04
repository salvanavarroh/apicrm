"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/leads";
import {
  NOTE_ACTIVITIES,
  NOTE_ACTIVITY_CLS,
  NOTE_ACTIVITY_LABEL,
  type NoteActivity,
} from "@/lib/tasks";

import { addLeadNote } from "@/app/(app)/admin/leads/actions";

export type LeadNote = {
  id: string;
  content: string;
  created_at: string;
  activity_type: NoteActivity | null;
  author: { first_name: string | null; last_name: string | null } | null;
};

type Props = {
  leadId: string;
  notes: LeadNote[];
  readonly?: boolean;
};

const NONE = "__none__";

export function NotesSection({ leadId, notes, readonly }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [activity, setActivity] = useState<string>(NONE);
  const [items, setItems] = useState<LeadNote[]>(notes);
  const [lastSynced, setLastSynced] = useState(notes);

  if (notes !== lastSynced) {
    setLastSynced(notes);
    setItems(notes);
  }

  function submit() {
    if (!content.trim()) return;
    const snapshotContent = content;
    const snapshotActivity = activity;
    const activityForSubmit =
      snapshotActivity === NONE ? null : (snapshotActivity as NoteActivity);
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`;
    const optimistic: LeadNote = {
      id: tempId,
      content: snapshotContent.trim(),
      created_at: new Date().toISOString(),
      activity_type: activityForSubmit,
      author: null,
    };
    setItems((prev) => [optimistic, ...prev]);
    setContent("");
    setActivity(NONE);

    startTransition(async () => {
      const result = await addLeadNote(
        leadId,
        snapshotContent,
        activityForSubmit,
      );
      if (!result.ok) {
        toast.error(result.message);
        setItems((prev) => prev.filter((n) => n.id !== tempId));
        setContent(snapshotContent);
        setActivity(snapshotActivity);
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
        <CardTitle>Notas y actividad</CardTitle>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "entrada" : "entradas"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!readonly && (
          <div className="flex flex-col gap-2">
            <Select value={activity} onValueChange={(v) => setActivity(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Solo nota</SelectItem>
                {NOTE_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {NOTE_ACTIVITY_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              rows={3}
              placeholder={
                activity === NONE
                  ? "Escribí una nota interna…"
                  : "Contanos qué pasó / qué dijo el cliente…"
              }
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
                {pending
                  ? "Guardando…"
                  : activity === NONE
                    ? "Agregar nota"
                    : "Registrar actividad"}
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
              className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5 text-sm"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  {note.activity_type && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${NOTE_ACTIVITY_CLS[note.activity_type]}`}
                    >
                      {NOTE_ACTIVITY_LABEL[note.activity_type]}
                    </span>
                  )}
                  <span>
                    {note.author
                      ? fullName(note.author.first_name, note.author.last_name)
                      : "—"}
                  </span>
                </div>
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

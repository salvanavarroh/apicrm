"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  addLeadTask,
  deleteLeadTask,
  toggleLeadTask,
} from "@/app/(app)/admin/leads/actions";

export type LeadTask = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  completed_at: string | null;
};

type Props = {
  leadId: string;
  tasks: LeadTask[];
  readonly?: boolean;
};

const PRIORITY_LABEL = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
} as const;
const PRIORITY_CLS = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-destructive/10 text-destructive",
} as const;

export function TasksSection({ leadId, tasks, readonly }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await addLeadTask(leadId, { title, priority, due_date: dueDate });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setTitle("");
      setDueDate("");
      toast.success("Tarea agregada");
      router.refresh();
    });
  }

  function toggle(taskId: string, done: boolean) {
    startTransition(async () => {
      const result = await toggleLeadTask(taskId, done);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove(taskId: string) {
    startTransition(async () => {
      const result = await deleteLeadTask(taskId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tareas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!readonly && (
          <div className="grid gap-2">
            <Input
              placeholder="Título de la tarea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Prioridad</Label>
                <Select
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as "low" | "medium" | "high")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Vencimiento</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={submit}
                disabled={pending || !title.trim()}
              >
                Agregar tarea
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {tasks.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin tareas
            </p>
          )}
          {tasks.map((task) => {
            const done = !!task.completed_at;
            return (
              <div
                key={task.id}
                className="flex items-start gap-2 rounded-md border bg-card px-3 py-2"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={(v) => toggle(task.id, Boolean(v))}
                  className="mt-0.5"
                  disabled={readonly}
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={
                        done
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm text-foreground"
                      }
                    >
                      {task.title}
                    </p>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLS[task.priority]}`}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </div>
                  {task.due_date && (
                    <p className="text-[11px] text-muted-foreground">
                      Vence el{" "}
                      {new Date(task.due_date).toLocaleDateString("es-AR")}
                    </p>
                  )}
                </div>
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => remove(task.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteForm, toggleFormStatus } from "./actions";

type Props = {
  formId: string;
  status: "active" | "inactive";
};

export function FormRowActions({ formId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const r = await toggleFormStatus(formId, next);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(next === "active" ? "Form activado" : "Form pausado");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("¿Eliminar este formulario? No se puede deshacer.")) return;
    startTransition(async () => {
      const r = await deleteForm(formId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Form eliminado");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label={status === "active" ? "Pausar" : "Activar"}
        className="size-8"
        onClick={toggle}
        disabled={pending}
      >
        {status === "active" ? (
          <PowerOff className="size-3.5" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Eliminar"
        className="size-8 text-destructive"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </>
  );
}

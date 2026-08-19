"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateLeadContact } from "@/app/(app)/admin/leads/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Corrige el teléfono o el email del lead desde la ficha.
 *
 * Está acá y no en el formulario completo del lead porque es la corrección más
 * frecuente (un dígito mal, un typo en el mail) y abrir el formulario entero
 * para eso invita a tocar de más.
 */
export function EditContactDialog({
  leadId,
  phone,
  email,
}: {
  leadId: string;
  phone: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(phone ?? "");
  const [e, setE] = useState(email ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    start(async () => {
      const res = await updateLeadContact(leadId, { phone: p, email: e });
      if (res.ok) {
        toast.success("Contacto actualizado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Al reabrir, volver a mostrar lo que está guardado y no lo que quedó
        // tipeado a medias la vez anterior.
        if (v) {
          setP(phone ?? "");
          setE(email ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Pencil className="size-3" />
          Editar contacto
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar contacto</DialogTitle>
          <DialogDescription>
            Con uno de los dos alcanza. Si cambiás el teléfono, los WhatsApp que
            entren desde el número nuevo se van a atar a este lead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-contact-phone">Teléfono</Label>
            <Input
              id="edit-contact-phone"
              value={p}
              onChange={(ev) => setP(ev.target.value)}
              placeholder="11 5555-5555"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-contact-email">Email</Label>
            <Input
              id="edit-contact-email"
              type="email"
              value={e}
              onChange={(ev) => setE(ev.target.value)}
              placeholder="cliente@mail.com"
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending || (!p.trim() && !e.trim())}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

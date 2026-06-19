"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Reenvía la invitación a un usuario pendiente, permitiendo corregir el email
 * (útil cuando rebotó el original). `action` recibe el email final.
 */
export function ResendInviteDialog({
  currentEmail,
  action,
}: {
  currentEmail: string;
  action: (email: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await action(email.trim());
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Invitación reenviada");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setEmail(currentEmail);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-1 size-3.5" /> Reenviar invitación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar invitación</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Podés corregir el email si el original rebotó. Validamos que no esté
            usado por otro usuario.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || !email.trim()}>
            {pending ? "Enviando…" : "Reenviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

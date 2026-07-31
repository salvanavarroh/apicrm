"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

/**
 * Diálogo de confirmación nativo de la app (reemplaza al confirm() del browser).
 * Controlado: `state` no-null lo abre; al cerrar/cancelar se llama onClose.
 */
export function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmOptions | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!state}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.description && (
            <DialogDescription>{state.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {state?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant={state?.danger ? "destructive" : "default"}
            onClick={() => {
              state?.onConfirm();
              onClose();
            }}
          >
            {state?.confirmLabel ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

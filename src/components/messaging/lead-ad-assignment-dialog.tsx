"use client";

import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ASSIGNMENT_MODES,
  type AssignmentMode,
  type VendorOption,
} from "@/lib/lead-ad-assignment";
import { cn } from "@/lib/utils";

import { setLeadAdFormAssignment } from "@/app/(app)/admin/lead-ads/actions";

/**
 * "¿Quién atiende los leads de ESTE formulario?".
 *
 * Va en diálogo y no inline en la fila porque el modo de rotación necesita
 * elegir varios vendedores: metido en la tarjeta, cada formulario ocupaba media
 * pantalla y la lista dejaba de servir para escanear.
 */
export function LeadAdAssignmentDialog({
  formId,
  formLabel,
  mode: initialMode,
  assignedUserId: initialAssignedUserId,
  rrUserIds: initialRrUserIds,
  vendors,
  trigger,
}: {
  formId: string;
  formLabel: string;
  mode: AssignmentMode;
  assignedUserId: string | null;
  rrUserIds: string[];
  vendors: VendorOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<AssignmentMode>(initialMode);
  const [assignedUserId, setAssignedUserId] = useState(initialAssignedUserId ?? "");
  const [rrUserIds, setRrUserIds] = useState<string[]>(initialRrUserIds);

  // Al abrir, arranca de lo que hay guardado: si la vez anterior cerró sin
  // guardar, no queremos que vuelva a encontrar su borrador a medio hacer.
  function handleOpenChange(next: boolean) {
    if (next) {
      setMode(initialMode);
      setAssignedUserId(initialAssignedUserId ?? "");
      setRrUserIds(initialRrUserIds);
    }
    setOpen(next);
  }

  function toggleVendor(id: string) {
    setRrUserIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  async function save() {
    setPending(true);
    try {
      const res = await setLeadAdFormAssignment({
        formId,
        mode,
        assignedUserId: assignedUserId || undefined,
        rrUserIds,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Reparto guardado");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const noVendors = vendors.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reparto de leads</DialogTitle>
          <DialogDescription>
            Quién atiende los leads que entren por “{formLabel}”. Aplica a los
            leads nuevos; el import histórico sigue quedando sin asignar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {ASSIGNMENT_MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/5"
                    : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      active ? "border-accent" : "border-input",
                    )}
                  >
                    {active && <span className="size-2 rounded-full bg-accent" />}
                  </span>
                  <span className="text-sm font-medium">{m.label}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{m.hint}</p>
              </button>
            );
          })}
        </div>

        {mode === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Vendedor
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="rounded-md border bg-background px-2.5 py-2 text-sm"
            >
              <option value="">Elegí un vendedor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.branch ? ` · ${v.branch}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "round_robin" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Vendedores en la rotación ({rrUserIds.length})
              </label>
              {vendors.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setRrUserIds(
                      rrUserIds.length === vendors.length
                        ? []
                        : vendors.map((v) => v.id),
                    )
                  }
                  className="text-xs font-medium text-accent underline underline-offset-2"
                >
                  {rrUserIds.length === vendors.length
                    ? "Ninguno"
                    : "Todos"}
                </button>
              )}
            </div>
            <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {vendors.map((v) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={rrUserIds.includes(v.id)}
                    onCheckedChange={() => toggleVendor(v.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  {v.branch && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {v.branch}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Si en el momento del lead ninguno está activo, el lead queda en el
              pool: nunca se lo damos a alguien que no elegiste.
            </p>
          </div>
        )}

        {noVendors && mode !== "auto" && mode !== "pool" && (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Users className="size-3.5 shrink-0" />
            No hay vendedores activos en la empresa. Cargalos en Usuarios y
            volvé.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

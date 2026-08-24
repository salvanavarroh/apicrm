"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Detalle de una solicitud de sucursal.
 *
 * El QA pidió poder ver la información de la solicitud al clickearla: la tabla
 * del historial muestra cinco columnas y el resto de los datos —dirección,
 * teléfono, quién la pidió, la nota de la decisión completa— quedaba invisible.
 * Los datos ya se traían; sólo no había dónde verlos.
 */
export type RequestDetail = {
  id: string;
  companyName: string;
  branchName: string;
  address: string | null;
  phone: string | null;
  requester: string | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

/** Fila clickeable + el diálogo con todo. */
export function RequestRow({
  detail,
  children,
}: {
  detail: RequestDetail;
  /** Las celdas de la fila, tal como las arma la página. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen(true)}
        className="cursor-pointer border-t border-border bg-card hover:bg-muted/40"
      >
        {children}
      </tr>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail.branchName}</DialogTitle>
            <DialogDescription>
              Solicitud de sucursal de {detail.companyName}
            </DialogDescription>
          </DialogHeader>

          <dl className="flex flex-col gap-2.5 text-sm">
            <Field label="Estado" value={STATUS_LABEL[detail.status] ?? detail.status} />
            <Field label="Dirección" value={detail.address} />
            <Field label="Teléfono" value={detail.phone} />
            <Field label="Solicitada por" value={detail.requester} />
            <Field
              label="Fecha"
              value={new Date(detail.createdAt).toLocaleString("es-AR", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
            {/* La nota va completa: en la tabla se corta con truncate y es
                justamente donde está el motivo de un rechazo. */}
            <Field label="Motivo de la decisión" value={detail.decisionNote} multiline />
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? "flex flex-col gap-0.5" : "flex justify-between gap-4"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          multiline
            ? "whitespace-pre-wrap text-sm"
            : "text-right text-sm font-medium"
        }
      >
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth";

export function OverdueBanner({
  role,
  info,
}: {
  role: UserRole;
  info: { amount: number; dueDate: string; daysOverdue: number };
}) {
  const isAdmin = role === "admin";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        {isAdmin ? (
          <>
            <p className="font-semibold">
              Pago vencido hace {info.daysOverdue} días.
            </p>
            <p className="text-destructive/85">
              Tu concesionaria tiene un pago pendiente de{" "}
              <strong>${info.amount}</strong> con vencimiento el{" "}
              <strong>{info.dueDate}</strong>. Regularizá para evitar la
              suspensión del servicio.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">
              Tu concesionaria tiene un pago vencido.
            </p>
            <p className="text-destructive/85">
              Contactá al administrador de tu cuenta para regularizar la
              situación.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

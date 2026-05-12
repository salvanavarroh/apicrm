"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { markPaymentAsPaid, toggleCompanyStatus } from "./actions";

export function MarkAsPaidButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Marcar como pagado?")) return;
        startTransition(async () => {
          const result = await markPaymentAsPaid(paymentId);
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          toast.success("Marcado como pagado");
          router.refresh();
        });
      }}
    >
      Marcar pagado
    </Button>
  );
}

export function CompanyStatusToggle({
  companyId,
  status,
}: {
  companyId: string;
  status: "active" | "pending" | "suspended";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isActive = status === "active";

  function flip() {
    const next: "active" | "suspended" = isActive ? "suspended" : "active";
    if (
      !confirm(
        next === "suspended"
          ? "¿Suspender la empresa? Verá un banner avisando al ingresar."
          : "¿Reactivar la empresa?",
      )
    )
      return;
    startTransition(async () => {
      const result = await toggleCompanyStatus(companyId, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(next === "suspended" ? "Empresa suspendida" : "Empresa reactivada");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      aria-label={isActive ? "Suspender" : "Reactivar"}
      className={
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
        (isActive ? "bg-success" : "bg-muted-foreground/30")
      }
    >
      <span
        className={
          "inline-block size-5 transform rounded-full bg-white shadow transition " +
          (isActive ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

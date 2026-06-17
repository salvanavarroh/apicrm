"use client";

import { LogIn } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { impersonateUser } from "@/app/(app)/super-admin/impersonation-actions";
import { Button } from "@/components/ui/button";

export function ImpersonateButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // En éxito hace redirect (no retorna). Solo vuelve si hubo error.
          const res = await impersonateUser(userId);
          if (res && !res.ok) toast.error(res.message);
        })
      }
    >
      <LogIn className="mr-1 size-3.5" /> Acceder
    </Button>
  );
}

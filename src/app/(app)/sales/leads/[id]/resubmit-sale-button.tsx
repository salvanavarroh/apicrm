"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resubmitSale } from "@/app/(app)/sales/sales/actions";

export function ResubmitSaleButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await resubmitSale(saleId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Venta reenviada para aprobación");
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={run} disabled={pending} className="mt-2">
      <Send className="mr-2 size-4" /> Reenviar para aprobación
    </Button>
  );
}

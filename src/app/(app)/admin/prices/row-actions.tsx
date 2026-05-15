"use client";

import { PencilLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { LeadFormOption } from "@/components/leads/lead-form";

import { deletePrice, type PriceInput } from "./actions";
import { PriceDialog } from "./price-dialog";

type Props = {
  price: PriceInput & { id: string };
  productTypes: LeadFormOption[];
};

export function RowActions({ price, productTypes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`¿Eliminar ${price.brand} ${price.model}?`)) return;
    startTransition(async () => {
      const result = await deletePrice(price.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Precio eliminado");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <PriceDialog
        productTypes={productTypes}
        initial={price}
        trigger={
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Editar"
          >
            <PencilLine className="size-3.5" />
          </Button>
        }
      />
      <Button
        size="icon"
        variant="ghost"
        className="size-7 text-destructive"
        onClick={remove}
        disabled={pending}
        aria-label="Eliminar"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

"use client";

import { PencilLine, Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteProductType, toggleProductTypeStatus } from "./actions";
import { ProductTypeDialog } from "./product-type-dialog";

type Branch = { id: string; name: string };
type ProductType = {
  id: string;
  name: string;
  status: "active" | "inactive";
  branch_ids: string[];
};

export function ProductTypeRowActions({
  productType,
  branches,
}: {
  productType: ProductType;
  branches: Branch[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const next = productType.status === "active" ? "inactive" : "active";
      const result = await toggleProductTypeStatus(productType.id, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        next === "active" ? "Tipo activado" : "Tipo desactivado",
      );
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar tipo "${productType.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteProductType(productType.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Tipo eliminado");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ProductTypeDialog
        branches={branches}
        productType={productType}
        trigger={
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Editar"
          >
            <PencilLine className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label={productType.status === "active" ? "Desactivar" : "Activar"}
        onClick={toggle}
        disabled={pending}
      >
        {productType.status === "active" ? (
          <PowerOff className="size-3.5" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 text-destructive"
        aria-label="Eliminar"
        onClick={remove}
        disabled={pending}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

"use client";

import { Car, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addLeadVehicleAction,
  deleteLeadVehicleAction,
} from "@/app/(app)/admin/leads/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type LeadVehicleItem = {
  id: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_version: string | null;
  preferred_color: string | null;
  notes: string | null;
  created_at: string;
};

export function LeadVehiclesSection({
  leadId,
  vehicles,
  canEdit = true,
}: {
  leadId: string;
  vehicles: LeadVehicleItem[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setBrand("");
    setModel("");
    setVersion("");
    setColor("");
    setNotes("");
    setAdding(false);
  }

  function add() {
    startTransition(async () => {
      const res = await addLeadVehicleAction(leadId, {
        vehicle_brand: brand,
        vehicle_model: model,
        vehicle_version: version,
        preferred_color: color,
        notes,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Consulta agregada");
      reset();
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteLeadVehicleAction(id, leadId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Consulta eliminada");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Consultas ({vehicles.length})</CardTitle>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-4" /> Agregar auto
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {vehicles.length === 0 && !adding && (
          <p className="text-muted-foreground">
            Sin consultas registradas todavía.
          </p>
        )}

        {vehicles.map((v) => (
          <div
            key={v.id}
            className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <Car className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {[v.vehicle_brand, v.vehicle_model, v.vehicle_version]
                    .filter(Boolean)
                    .join(" ") || "Auto sin especificar"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {v.preferred_color ? `Color: ${v.preferred_color}` : null}
                  {v.preferred_color && v.notes ? " · " : null}
                  {v.notes}
                </div>
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(v.id)}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Eliminar consulta"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}

        {adding && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder="Marca"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
              <Input
                placeholder="Modelo"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <Input
                placeholder="Versión"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
              <Input
                placeholder="Color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <Input
                placeholder="Notas"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={add} disabled={pending}>
                {pending ? "Agregando…" : "Agregar"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

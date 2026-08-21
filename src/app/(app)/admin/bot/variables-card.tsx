"use client";

import { AlertTriangle, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { BranchVars } from "@/app/(app)/admin/bot/actions";
import { Card } from "@/components/ui/card";
import { BOT_VARS } from "@/lib/bot/variables";
import { cn } from "@/lib/utils";

/**
 * Las variables, en un solo lugar y con su valor real.
 *
 * El problema que resuelve: configurando el bot había que ver `{horario}` en cada
 * una de las ocho respuestas y parecía que había que completarlo a mano en todas.
 * No hace falta — sale del horario de la concesionaria. Acá se muestra ya
 * resuelto, con de dónde sale, y qué dato falta cargar cuando falta.
 */
export function VariablesCard({ branches }: { branches: BranchVars[] }) {
  const [sel, setSel] = useState(0);
  const b = branches[sel];

  if (!b) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No hay sucursales activas: sin sucursal el bot no interviene.
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Datos que usa el bot</h2>
          <p className="text-xs text-muted-foreground">
            Se completan solos con lo que ya está cargado. No hay que escribirlos
            en cada respuesta: alcanza con poner la variable.
          </p>
        </div>
        {branches.length > 1 && (
          <div className="inline-flex rounded-lg border p-0.5">
            {branches.map((x, i) => (
              <button
                key={x.branchId}
                type="button"
                onClick={() => setSel(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  i === sel ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {x.branchName}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="pb-1.5 text-left">Variable</th>
              <th className="pb-1.5 text-left">Valor de hoy</th>
              <th className="pb-1.5 text-left">De dónde sale</th>
            </tr>
          </thead>
          <tbody>
            {BOT_VARS.map((v) => {
              const value = b.values[v.key] ?? "";
              const empty = !value;
              return (
                <tr key={v.key} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 align-top">
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      {`{${v.key}}`}
                    </code>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    {empty ? (
                      <span className="inline-flex items-center gap-1 text-warning-text">
                        <AlertTriangle className="size-3" /> sin cargar
                      </span>
                    ) : (
                      <span className="font-medium">{value}</span>
                    )}
                  </td>
                  <td className="py-1.5 align-top text-muted-foreground">
                    {v.source}
                    {empty && v.fixHref && (
                      <>
                        {" · "}
                        <Link href={v.fixHref} className="text-accent hover:underline">
                          cargarlo
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {b.missing.length === 0 ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-success">
          <Check className="size-3.5" /> Todos los datos están cargados: las
          respuestas van a salir completas.
        </p>
      ) : (
        <p className="rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning-text">
          Falta cargar {b.missing.map((m) => `{${m}}`).join(", ")} en{" "}
          {b.branchName}. Las respuestas que usen esa variable van a salir con un
          hueco.
        </p>
      )}
    </Card>
  );
}

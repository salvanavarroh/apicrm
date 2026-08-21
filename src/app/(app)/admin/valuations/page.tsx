import { AlertTriangle } from "lucide-react";

import {
  getValuationSettings,
  guideAsOf,
} from "@/app/(app)/admin/valuations/actions";
import { ValuationSettingsView } from "@/app/(app)/admin/valuations/settings-view";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/used-prices/valuate";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Días desde una fecha YYYY-MM-DD. Fuera del render por la regla de pureza. */
function daysSince(ymd: string): number {
  return Math.floor((Date.now() - new Date(`${ymd}T00:00:00`).getTime()) / 86_400_000);
}
function thisYear(): number {
  return new Date().getFullYear();
}

export default async function ValuationsPage() {
  await requireRole(["admin"]);
  const [settings, asOf] = await Promise.all([getValuationSettings(), guideAsOf()]);
  const stale = asOf ? daysSince(asOf) > 45 : false;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cotizador de usados</h1>
        <p className="text-sm text-muted-foreground">
          El precio sale de la Guía Oficial de ACARA. Acá se define cuánto se le
          descuenta para llegar a lo que la concesionaria ofrece.
        </p>
      </header>

      {/* De cuándo es el precio con el que estamos cotizando. Es lo primero que
          hay que saber antes de mirar cualquier porcentaje. */}
      {asOf ? (
        <Card
          className={
            stale
              ? "flex flex-row items-center gap-2 border-warning/40 bg-warning/10 p-3 text-sm text-warning-text"
              : "flex flex-row items-center gap-2 p-3 text-sm"
          }
        >
          {stale && <AlertTriangle className="size-4 shrink-0" />}
          <span>
            Guía vigente: <b>{MESES[Number(asOf.slice(5, 7)) - 1]} {asOf.slice(0, 4)}</b>
            {stale
              ? ` — hace ${daysSince(asOf)} días que no se sincroniza. Los precios de usados se mueven todos los meses.`
              : ` · sincronizada hace ${daysSince(asOf)} día(s).`}
          </span>
        </Card>
      ) : (
        <Card className="border-warning/40 bg-warning/10 p-3 text-sm text-warning-text">
          Todavía no hay guía sincronizada: el cotizador no va a encontrar
          precios. Hay que correr la sincronización de ACARA.
        </Card>
      )}

      <ValuationSettingsView
        initial={
          settings ?? {
            ...DEFAULT_SETTINGS,
            usdRate: null,
            usdRateUpdatedAt: null,
          }
        }
        currentYear={thisYear()}
      />
    </div>
  );
}

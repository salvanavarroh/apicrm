import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL = {
  evaluating: "En evaluación",
  accepted: "Aceptada",
  rejected: "Rechazada",
} as const;

const STATUS_VARIANT: Record<keyof typeof STATUS_LABEL, "default" | "secondary" | "destructive"> = {
  evaluating: "default",
  accepted: "secondary",
  rejected: "destructive",
};

export default async function VendorSalesPage() {
  const profile = await requireRole(["sales"]);
  const supabase = await createClient();

  const { data: sales } = await supabase
    .from("sales")
    .select(
      `
        id,
        status,
        final_price,
        commission_percent_snapshot,
        started_at,
        resolved_at,
        lead:leads (id, first_name, last_name, vehicle_model)
      `,
    )
    .eq("vendor_id", profile.id)
    .order("started_at", { ascending: false });

  const rows = sales ?? [];

  const accepted = rows.filter((s) => s.status === "accepted");
  const totalGanancia = accepted.reduce((acc, s) => {
    const pct = s.commission_percent_snapshot ?? 0;
    return acc + Number(s.final_price) * (Number(pct) / 100);
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mis ventas</h1>
        <p className="text-sm text-muted-foreground">
          Historial completo. La comisión se congela al aprobar la venta.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total ventas" value={String(rows.length)} />
        <Stat
          label="Aceptadas"
          value={`${accepted.length}`}
        />
        <Stat label="Comisión acumulada" value={formatARS(totalGanancia)} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Todavía no iniciaste ninguna venta.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Vehículo</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-right">Comisión</th>
                <th className="px-4 py-2 text-left">Inicio</th>
                <th className="px-4 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b bg-background last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    {s.lead ? (
                      <Link
                        href={`/sales/leads/${s.lead.id}`}
                        className="hover:underline"
                      >
                        {fullName(s.lead.first_name, s.lead.last_name)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.lead?.vehicle_model ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatARS(s.final_price)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {s.commission_percent_snapshot ? (
                      <>
                        {s.commission_percent_snapshot}% ·{" "}
                        <span className="font-mono">
                          {formatARS(
                            Number(s.final_price) *
                              (Number(s.commission_percent_snapshot) / 100),
                          )}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(s.started_at).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

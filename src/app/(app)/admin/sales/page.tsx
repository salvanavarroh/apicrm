import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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

export default async function AdminSalesPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: sales } = await supabase
    .from("sales")
    .select(
      `
        id,
        status,
        final_price,
        started_at,
        resolved_at,
        vendor:profiles!vendor_id (first_name, last_name),
        lead:leads (id, first_name, last_name, vehicle_model)
      `,
    )
    .eq("company_id", profile.company_id!)
    .order("started_at", { ascending: false });

  const all = sales ?? [];
  const evaluating = all.filter((s) => s.status === "evaluating");
  const resolved = all.filter((s) => s.status !== "evaluating");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Validá las ventas iniciadas por tus vendedores con el triple check.
        </p>
      </header>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            En evaluación{" "}
            <span className="ml-2 rounded-full bg-warning/20 px-2 text-[10px] font-semibold text-warning-foreground">
              {evaluating.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <SalesTable rows={evaluating} cta="Validar" />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <SalesTable rows={resolved} cta="Ver" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesTable({
  rows,
  cta,
}: {
  rows: {
    id: string;
    status: keyof typeof STATUS_LABEL;
    final_price: number;
    started_at: string;
    resolved_at: string | null;
    vendor: { first_name: string | null; last_name: string | null } | null;
    lead: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      vehicle_model: string | null;
    } | null;
  }[];
  cta: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        Sin ventas en este filtro.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Lead</th>
            <th className="px-4 py-2 text-left">Vendedor</th>
            <th className="px-4 py-2 text-right">Monto</th>
            <th className="px-4 py-2 text-left">Inicio</th>
            <th className="px-4 py-2 text-left">Estado</th>
            <th className="px-4 py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b bg-card last:border-0 hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">
                {s.lead ? (
                  <>
                    <span>
                      {fullName(s.lead.first_name, s.lead.last_name)}
                    </span>
                    {s.lead.vehicle_model && (
                      <span className="block text-xs text-muted-foreground">
                        {s.lead.vehicle_model}
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {s.vendor
                  ? fullName(s.vendor.first_name, s.vendor.last_name)
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatARS(s.final_price)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(s.started_at).toLocaleDateString("es-AR")}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[s.status]}>
                  {STATUS_LABEL[s.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/sales/${s.id}`}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {cta} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

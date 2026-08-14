import {
  VendorSalesTable,
  type VendorSaleRow,
} from "@/components/sales/vendor-sales-table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mis ventas</h1>
        <p className="text-sm text-muted-foreground">
          Historial completo. La comisión se congela al aprobar la venta.
        </p>
      </header>

      <VendorSalesTable sales={(sales ?? []) as unknown as VendorSaleRow[]} />
    </div>
  );
}

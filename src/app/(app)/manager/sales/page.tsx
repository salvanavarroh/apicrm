import { SalesLists, type SaleListRow } from "@/components/sales/sales-lists";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SALES_SELECT = `
  id, status, final_price, started_at,
  vendor:profiles!vendor_id (first_name, last_name),
  lead:leads (first_name, last_name, vehicle_model)
`;

// La RLS scopea las ventas a las gerencias del gerente / supervisor.
export default async function ManagerSalesPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  const { data: sales } = await supabase
    .from("sales")
    .select(SALES_SELECT)
    .eq("company_id", profile.company_id!)
    .order("started_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Validá las ventas que inician tus vendedores con el triple check.
        </p>
      </header>
      <SalesLists
        sales={(sales ?? []) as unknown as SaleListRow[]}
        basePath="/manager/sales"
      />
    </div>
  );
}

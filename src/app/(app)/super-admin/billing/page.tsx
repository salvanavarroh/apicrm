import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function BillingPage() {
  await requireRole(["super_admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Controlá el estado de pagos, facturación y activación de cada
          concesionaria.
        </p>
      </header>

      <Card className="flex items-center justify-center px-6 py-16 text-sm text-muted-foreground">
        Próximamente — Sprint 2.
      </Card>
    </div>
  );
}

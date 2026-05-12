import { Building2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function SuperAdminHomePage() {
  await requireRole(["super_admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Dá de alta concesionarias, sus sucursales y responsables desde un solo
          lugar.
        </p>
      </header>

      <Card className="flex flex-col gap-6 p-8">
        <Building2 className="size-7 text-foreground" />

        <h2 className="max-w-md text-3xl font-bold leading-tight">
          Comienza a crear concesionarias ahora!
        </h2>

        <div className="flex flex-col items-start justify-between gap-4 border-l-[3px] border-accent pl-3 sm:flex-row sm:items-end">
          <p className="max-w-md text-sm text-muted-foreground">
            Podrás crear <strong className="text-foreground">concesionarias</strong>{" "}
            y asignar <strong className="text-foreground">administradores</strong>.
          </p>
          <Button asChild>
            <Link href="/super-admin/companies">
              Cargar concesionaria
              <span aria-hidden>›</span>
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

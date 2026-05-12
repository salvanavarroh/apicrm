import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function AdminHomePage() {
  await requireRole(["admin"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Configurá tu empresa: sucursales, tipos de producto y campañas desde
          un solo lugar.
        </p>
      </header>

      <Card className="flex flex-col gap-6 p-8">
        <Building2 className="size-7 text-foreground" />

        <h2 className="max-w-md text-3xl font-bold leading-tight">
          Empezá a configurar tu concesionaria
        </h2>

        <div className="flex flex-col items-start justify-between gap-4 border-l-[3px] border-accent pl-3 sm:flex-row sm:items-end">
          <p className="max-w-md text-sm text-muted-foreground">
            Creá tus <strong className="text-foreground">sucursales</strong>,
            tus <strong className="text-foreground">tipos de producto</strong>{" "}
            y las <strong className="text-foreground">campañas</strong> con las
            que vas a capturar leads.
          </p>
          <Button asChild>
            <Link href="/admin/branches">
              Cargar sucursales
              <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

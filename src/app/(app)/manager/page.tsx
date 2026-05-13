import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function ManagerHomePage() {
  await requireRole(["manager"]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Armá tu equipo de vendedores y configurá cómo se asignan los leads.
        </p>
      </header>

      <Card className="flex flex-col gap-6 p-8">
        <Users className="size-7 text-foreground" />

        <h2 className="max-w-md text-3xl font-bold leading-tight">
          Sumá vendedores a tu equipo
        </h2>

        <div className="flex flex-col items-start justify-between gap-4 border-l-[3px] border-accent pl-3 sm:flex-row sm:items-end">
          <p className="max-w-md text-sm text-muted-foreground">
            Invitá <strong className="text-foreground">vendedores</strong>,
            asigná <strong className="text-foreground">comisiones</strong> y
            activá la <strong className="text-foreground">asignación
            automática</strong> de leads por gerencia.
          </p>
          <Button asChild>
            <Link href="/manager/team">
              Cargar vendedores
              <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

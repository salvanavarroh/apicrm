import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export default async function SuperAdminPage() {
  await requireRole(["super_admin"]);

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, status, monthly_price, subscription_ends_at, created_at")
    .order("created_at", { ascending: false });

  const list = companies ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Todavía no hay empresas en la plataforma."
              : `${list.length} ${list.length === 1 ? "empresa" : "empresas"} en la plataforma.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/super-admin/companies/new">Nueva empresa</Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Creá la primera empresa para arrancar el piloto.
            </p>
            <Button asChild variant="outline">
              <Link href="/super-admin/companies/new">Crear empresa</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Precio mensual</th>
                <th className="px-4 py-2 font-medium">Vence</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-muted-foreground">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.monthly_price ? `$${c.monthly_price}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.subscription_ends_at ?? "—"}
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

import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

import { NewCompanyForm } from "./new-company-form";

export default async function NewCompanyPage() {
  await requireRole(["super_admin"]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva empresa</h1>
        <p className="text-sm text-muted-foreground">
          Alta en 2 pasos: datos de la empresa + Admin inicial.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <NewCompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}

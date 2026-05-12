import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

import { CompanyForm } from "./company-form";

export default async function AdminCompanyPage() {
  const profile = await requireRole(["admin"]);

  if (!profile.company_id) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Mi empresa</h1>
        <p className="text-sm text-muted-foreground">
          No tenés empresa asignada.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .single();

  if (!company) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Mi empresa</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar los datos de tu empresa.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Mi empresa</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Datos operativos editables. Los datos legales solo los modifica el
          SuperAdmin.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Datos operativos</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyForm
              initial={{
                name: company.name,
                phone: company.phone,
                address: company.address,
                logo_url: company.logo_url,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos legales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Field label="Razón social" value={company.legal_name} />
            <Field label="CUIT" value={company.cuit} />
            <Field
              label="Precio mensual"
              value={
                company.monthly_price !== null
                  ? `$${company.monthly_price}`
                  : null
              }
            />
            <Field
              label="Vencimiento"
              value={company.subscription_ends_at}
            />
            <Field label="Estado" value={company.status} />
            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Para modificar estos datos contactá al SuperAdmin.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{value ?? "—"}</span>
    </div>
  );
}

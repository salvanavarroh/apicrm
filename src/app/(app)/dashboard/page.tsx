import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bienvenido. Tu rol: <strong>{profile.role.replace("_", " ")}</strong>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>En construcción</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            El dashboard de tu rol se arma en sprints posteriores.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

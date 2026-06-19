import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";

import { ProfileForm } from "./profile-form";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "SuperAdmin",
  admin: "Admin",
  manager: "Gerente de ventas",
  sales: "Vendedor",
  data_provider: "Proveedor de datos",
};

export default async function ProfilePage() {
  const profile = await requireProfile();

  const { data: usersData } = await createAdminClient().auth.admin.listUsers({
    perPage: 1000,
  });
  const me = usersData.users.find((u) => u.id === profile.id);
  const email = me?.email ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Mi perfil</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Actualizá tus datos personales y cambiá tu contraseña.
        </p>
      </header>

      <Card>
        <CardContent className="py-6">
          <ProfileForm
            initial={{
              id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              phone: profile.phone,
              email,
              role: ROLE_LABEL[profile.role] ?? profile.role,
              avatar_url: profile.avatar_url,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { AlertTriangle, Building2 } from "lucide-react";

import { MotorboxFrame } from "@/components/motorbox/motorbox-frame";
import { requireRole } from "@/lib/auth";
import { embedOrigin, motorboxReady } from "@/lib/motorbox/config";
import { buildSsoUrl, resolveUserEmail } from "@/lib/motorbox/ticket";
import { createAdminClient } from "@/lib/supabase/admin";

// Motorbox, embebido. Ver docs/motorbox-spec-api.md §5.2.
export const dynamic = "force-dynamic";

function Notice({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <Icon className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-medium">{title}</h1>
        {children && (
          <div className="text-sm text-muted-foreground">{children}</div>
        )}
      </div>
    </div>
  );
}

export default async function MotorboxPage() {
  const profile = await requireRole(["admin"]);

  // Un admin de grupo sin marca activa no tiene concesionaria que publicar:
  // cada marca es un dealer distinto en Motorbox.
  if (!profile.company_id) {
    return (
      <Notice icon={Building2} title="Elegí una marca">
        Motorbox trabaja sobre una concesionaria por vez. Seleccioná una marca
        arriba y volvé a entrar.
      </Notice>
    );
  }

  const ready = motorboxReady();
  const origin = embedOrigin();
  if (!ready.ok || !origin) {
    // En dev es lo normal (faltan las env vars). En producción es un error de
    // configuración, y conviene que se vea en los logs.
    if (process.env.NODE_ENV === "production") {
      console.error("[motorbox] falta configuración:", ready.missing.join(", "));
    }
    return (
      <Notice icon={AlertTriangle} title="Motorbox todavía no está disponible">
        La integración no está configurada en este entorno.
      </Notice>
    );
  }

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("id, name, country, status")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (!company) {
    return (
      <Notice icon={AlertTriangle} title="No encontramos la concesionaria" />
    );
  }

  if (company.status !== "active") {
    return (
      <Notice icon={AlertTriangle} title="La cuenta está suspendida">
        Mientras la cuenta esté suspendida no se puede publicar en Motorbox.
      </Notice>
    );
  }

  const email = await resolveUserEmail(admin, profile.id);
  if (!email) {
    return (
      <Notice icon={AlertTriangle} title="Tu usuario no tiene email">
        Motorbox necesita un email para crear tu cuenta. Revisalo en tu perfil.
      </Notice>
    );
  }

  const url = await buildSsoUrl({ profile, email, company });

  return (
    // La `key` NO es decorativa: un admin de grupo que cambia de marca tiene que
    // REMONTAR el iframe. Sin esto seguiría viendo el dealer de la marca
    // anterior, o sea datos de otra concesionaria adentro del CRM.
    <MotorboxFrame key={company.id} initialUrl={url} embedOrigin={origin} />
  );
}

import { ChevronRight, FileUp, Layers, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DataProviderHomePage() {
  const profile = await requireRole(["data_provider"]);
  const supabase = await createClient();

  const [{ count: total }, { count: pool }, { count: newCount }] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("created_by", profile.id),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("created_by", profile.id)
      .or("branch_id.is.null,product_type_id.is.null"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("created_by", profile.id)
      .eq("status", "new"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {profile.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Cargá leads manualmente o por CSV. Los que queden sin clasificar
          podés volver a editarlos hasta que un vendedor los tome.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Mis cargas" value={total ?? 0} />
        <Stat label="En el pool" value={pool ?? 0} hint="Sin clasificar" />
        <Stat
          label="Nuevos"
          value={newCount ?? 0}
          hint="Sin contactar todavía"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ActionCard
          href="/data-provider/leads/new"
          icon={Plus}
          title="Nuevo lead"
          description="Cargá un lead manualmente."
        />
        <ActionCard
          href="/data-provider/leads/import"
          icon={FileUp}
          title="Importar CSV"
          description="Subí un archivo y revisá cada fila antes de confirmar."
        />
        <ActionCard
          href="/data-provider/pool"
          icon={Layers}
          title="Pool sin clasificar"
          description="Editá o clasificá tus cargas pendientes."
        />
      </div>

      <div>
        <Button variant="outline" asChild>
          <Link href="/data-provider/leads">
            Ver todas mis cargas
            <ChevronRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Plus;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent">
        <span className="rounded-md bg-accent/10 p-2 text-accent">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </Card>
    </Link>
  );
}

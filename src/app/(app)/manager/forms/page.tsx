import { ExternalLink, Pencil, Plus, Share2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { FormShareDialog } from "@/app/(app)/admin/forms/share-dialog";
import { FormRowActions } from "@/app/(app)/admin/forms/row-actions";

export default async function ManagerFormsPage() {
  const profile = await requireRole(["manager", "supervisor"]);
  const supabase = await createClient();

  // RLS filtra a sus gerencias automáticamente.
  const { data: forms } = await supabase
    .from("lead_capture_forms")
    .select(
      `id, slug, name, status, created_at, submissions_count, primary_color,
       branch:branches!branch_id (name),
       product_type:product_types!product_type_id (name),
       campaign:campaigns!campaign_id (name)`,
    )
    .eq("company_id", profile.company_id!)
    .order("created_at", { ascending: false });

  const rows = forms ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formularios</h1>
          <p className="text-sm text-muted-foreground">
            Formularios públicos que rutean leads a tus gerencias.
          </p>
        </div>
        <Button asChild>
          <Link href="/manager/forms/new">
            <Plus className="mr-2 size-4" /> Nuevo formulario
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Share2 className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no creaste formularios. Armá uno para tu gerencia y
            empezá a captar leads.
          </p>
          <Button asChild>
            <Link href="/manager/forms/new">Crear primer formulario</Link>
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="w-full overflow-x-auto">

            <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Sucursal · Tipo</th>
                <th className="px-4 py-3 font-medium">Campaña</th>
                <th className="px-4 py-3 text-center font-medium">
                  Submissions
                </th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr
                  key={f.id}
                  className="border-t border-border bg-card hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: f.primary_color }}
                      />
                      <Link
                        href={`/manager/forms/${f.id}`}
                        className="font-medium hover:underline"
                      >
                        {f.name}
                      </Link>
                    </div>
                    <p className="ml-5 text-xs text-muted-foreground">
                      slug: <span className="font-mono">{f.slug}</span>
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{f.branch?.name ?? "—"}</div>
                    <div className="text-muted-foreground">
                      {f.product_type?.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {f.campaign?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {f.submissions_count}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        f.status === "active"
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {f.status === "active" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <FormShareDialog
                        slug={f.slug}
                        active={f.status === "active"}
                        trigger={
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Compartir"
                            className="size-8"
                          >
                            <Share2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        asChild
                        variant="outline"
                        size="icon"
                        aria-label="Abrir landing"
                        className="size-8"
                      >
                        <a
                          href={`/f/${f.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="icon"
                        aria-label="Editar"
                        className="size-8"
                      >
                        <Link href={`/manager/forms/${f.id}`}>
                          <Pencil className="size-3.5" />
                        </Link>
                      </Button>
                      <FormRowActions
                        formId={f.id}
                        status={f.status as "active" | "inactive"}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Card>
      )}
    </div>
  );
}

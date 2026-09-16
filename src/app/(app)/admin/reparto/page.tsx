import { AlertTriangle, PenLine, Upload } from "lucide-react";
import Link from "next/link";

import { AssignmentRuleDialog } from "@/components/assignment/rule-dialog";
import { RuleBadge } from "@/components/assignment/rule-badge";
import { SourceIcon, platformLabel } from "@/components/assignment/source-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { SOURCE_KIND_LABELS, type SourceKind } from "@/lib/assignment-rules";
import { loadAssignmentOverview } from "@/lib/assignment-sources";
import { cn } from "@/lib/utils";

/** Qué decir cuando un tipo de origen todavía no tiene ninguno cargado. */
const EMPTY_HINT: Record<
  SourceKind,
  { text: string; href?: string; cta?: string }
> = {
  meta_form: {
    text: "Todavía no mapeaste formularios de Lead Ads.",
    href: "/admin/integraciones?tab=leadads",
    cta: "Ir a Lead Ads",
  },
  channel: {
    text: "No hay canales conectados.",
    href: "/admin/integraciones",
    cta: "Conectar",
  },
  capture_form: {
    text: "No creaste formularios propios.",
    href: "/admin/forms",
    cta: "Ir a Formularios",
  },
  sheet: {
    text: "No hay planillas conectadas.",
    href: "/admin/sheets",
    cta: "Ir a Google Sheets",
  },
  import: { text: "" },
};

export default async function RepartoPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const { defaultRule, groups, vendors } = await loadAssignmentOverview(
    profile.company_id,
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Reparto de leads</h1>
        <p className="border-accent text-muted-foreground border-l-[3px] pl-3 text-sm">
          A quién le llega cada lead, según por dónde entró. Lo que no tenga
          regla propia usa la de la empresa.
        </p>
      </header>

      {/* Sin vendedores nada de esto reparte. Va arriba de todo porque es la
          causa, no una consecuencia: sin esto el admin configura un 70/30 que
          no le va a asignar nada a nadie y no entiende por qué. */}
      {vendors.length === 0 && (
        <div className="border-warning/40 bg-warning/5 flex items-start gap-3 rounded-xl border px-4 py-3">
          <AlertTriangle className="text-warning-text mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-warning-text font-medium">
              No hay vendedores activos
            </p>
            <p className="text-muted-foreground mt-0.5">
              Hasta que cargues alguno, todos los leads que entren van a quedar
              en el pool sin dueño, sin importar cómo configures el reparto.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <Link href="/admin/users">Cargar vendedores</Link>
          </Button>
        </div>
      )}

      {/* La regla de la empresa manda sobre todo lo demás: va primero y con
          más peso visual que las filas que la heredan. */}
      <Card className="border-accent/30 bg-accent/[0.03] gap-0 p-0">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Regla de la empresa</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              La usan todas las entradas sin regla propia, y la carga manual.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <RuleBadge
              mode={defaultRule.mode}
              members={defaultRule.members}
              vendors={vendors}
              inheritedMode={defaultRule.mode}
              inheritedMembers={defaultRule.members}
            />
            <AssignmentRuleDialog
              sourceKind="meta_form"
              sourceId=""
              sourceName="la empresa"
              mode={defaultRule.mode}
              members={defaultRule.members}
              vendors={vendors}
              defaultRuleLabel={defaultRule.label}
              trigger={<Button variant="outline">Cambiar</Button>}
            />
          </div>
        </div>
      </Card>

      {groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">
              {SOURCE_KIND_LABELS[group.kind]}
            </h2>
            {group.rows.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {group.rows.length}
              </span>
            )}
          </div>

          {group.rows.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3">
              <p className="text-muted-foreground text-sm">
                {EMPTY_HINT[group.kind].text}
              </p>
              {EMPTY_HINT[group.kind].href && (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={EMPTY_HINT[group.kind].href!}>
                    {EMPTY_HINT[group.kind].cta}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Card className="gap-0 overflow-hidden p-0">
              {group.rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/40 flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center",
                    i > 0 && "border-t",
                  )}
                >
                  {/* En mobile el nombre se lleva la fila entera: apretado
                      entre el chip y el botón quedaba "Financia…". */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cn(!row.active && "opacity-50")}>
                      <SourceIcon kind={row.kind} platform={row.platform} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          !row.active && "text-muted-foreground",
                        )}
                      >
                        {row.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[
                          platformLabel(row.platform),
                          row.detail,
                          !row.active ? "inactivo" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                    <RuleBadge
                      mode={row.mode}
                      members={row.members}
                      vendors={vendors}
                      inheritedMode={defaultRule.mode}
                      inheritedMembers={defaultRule.members}
                    />

                    <AssignmentRuleDialog
                      sourceKind={row.kind}
                      sourceId={row.id}
                      sourceName={row.name}
                      mode={row.mode}
                      members={row.members}
                      vendors={vendors}
                      defaultRuleLabel={defaultRule.label}
                      trigger={
                        <Button size="sm" variant="outline">
                          Cambiar
                        </Button>
                      }
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      ))}

      {/* Las dos entradas que no se configuran acá. Estaban sólo mencionadas en
          la nota al pie, y eso dejaba el mapa incompleto: el admin no podía
          saber qué pasa con un lead que carga a mano. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Otras entradas</h2>
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <PenLine className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Carga manual</p>
              <p className="text-muted-foreground text-xs">
                Un vendedor que carga un lead se lo queda; si lo carga otro rol,
                usa la regla de la empresa.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t px-4 py-3">
            <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Upload className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Carga masiva</p>
              <p className="text-muted-foreground text-xs">
                El reparto se elige en cada importación, y la opción “repartir”
                usa la regla de la empresa.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Si al entrar un lead ningún vendedor de la regla califica, va al pool y
        lo puede tomar cualquiera: nunca se pierde ni se le da a alguien que no
        elegiste.
      </p>
    </div>
  );
}

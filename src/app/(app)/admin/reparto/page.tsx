import { Info, Split } from "lucide-react";

import { AssignmentRuleDialog } from "@/components/assignment/rule-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { SOURCE_KIND_LABELS, ruleSummary } from "@/lib/assignment-rules";
import { loadAssignmentOverview } from "@/lib/assignment-sources";
import { cn } from "@/lib/utils";

export default async function RepartoPage() {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;

  const { defaultRule, groups, vendors } = await loadAssignmentOverview(
    profile.company_id,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Reparto de leads</h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Cada puerta de entrada puede repartir distinto. La que no tenga regla
          propia usa la de la empresa.
        </p>
      </header>

      {/* La regla de la empresa, primero: es la que gobierna todo lo demás. */}
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Regla de la empresa</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ruleSummary(defaultRule.mode, defaultRule.members, vendors)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              La usan todas las entradas que no tengan una propia, más la carga
              manual de leads.
            </p>
          </div>
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
      </Card>

      {groups.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Split className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no hay orígenes de leads configurados. Conectá un canal o
            mapeá un formulario y va a aparecer acá.
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {SOURCE_KIND_LABELS[group.kind]}
              <span className="ml-1.5 font-normal normal-case">
                ({group.rows.length})
              </span>
            </h2>
            <Card className="overflow-hidden p-0">
              {group.rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
                    i > 0 && "border-t",
                    !row.active && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.name}
                      {!row.active && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          inactivo
                        </span>
                      )}
                    </p>
                    {row.detail && (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {row.detail}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-sm",
                      row.mode === "inherit"
                        ? "text-muted-foreground"
                        : "font-medium",
                    )}
                  >
                    {ruleSummary(row.mode, row.members, vendors)}
                  </p>
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
              ))}
            </Card>
          </section>
        ))
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Si en el momento del lead ningún vendedor de la regla califica —porque
          lo dieron de baja o no quedó ninguno elegido— el lead va al pool y lo
          puede tomar cualquiera. Nunca se pierde ni se le da a alguien que no
          elegiste. En la carga masiva el reparto se elige en cada importación.
        </span>
      </p>
    </div>
  );
}

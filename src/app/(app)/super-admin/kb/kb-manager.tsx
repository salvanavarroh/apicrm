"use client";

// ============================================================================
// Pantalla de curaduría: los huecos arriba, los artículos abajo.
//
// El orden no es casual. Lo primero que tiene que ver quien entra acá es qué
// está preguntando la gente y el asistente no sabe contestar — eso es el trabajo
// pendiente. El listado de artículos es referencia.
// ============================================================================

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  deleteManualArticle,
  dismissGap,
  saveManualArticle,
  type ArticleFormInput,
} from "./actions";

export type GapRow = {
  id: string;
  question: string;
  role: string | null;
  hits: number;
  created_at: string;
};

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  source: "repo" | "generado" | "manual";
  source_path: string | null;
  audience_roles: string[] | null;
  updated_at: string;
  chunks: number;
  body_md: string;
  feature: string | null;
  route_prefix: string | null;
  keywords: string[];
};

const SOURCE_META: Record<
  ArticleRow["source"],
  { label: string; hint: string; className: string }
> = {
  repo: {
    label: "Repo",
    hint: "Sale de un archivo markdown. Se edita el archivo y se reindexa.",
    className: "border-info/40 text-info",
  },
  generado: {
    label: "Generado",
    hint: "Derivado del código. No se edita a mano: cambia solo en el próximo build.",
    className: "border-success/40 text-success",
  },
  manual: {
    label: "Manual",
    hint: "Escrito acá. Es el único tipo que se edita desde esta pantalla.",
    className: "border-accent/40 text-accent",
  },
};

export function KbManager({
  gaps,
  articles,
}: {
  gaps: GapRow[];
  articles: ArticleRow[];
}) {
  const [editing, setEditing] = useState<{
    slug?: string;
    gapId?: string;
    form: ArticleFormInput;
  } | null>(null);
  const [pending, start] = useTransition();

  function openNew(gap?: GapRow) {
    setEditing({
      gapId: gap?.id,
      form: {
        title: gap ? gap.question.slice(0, 110) : "",
        summary: "",
        bodyMd: gap
          ? `Alguien preguntó: «${gap.question}»\n\nRespuesta:\n\n`
          : "",
        keywords: "",
      },
    });
  }

  function openEdit(a: ArticleRow) {
    setEditing({
      slug: a.slug,
      form: {
        title: a.title,
        summary: a.summary ?? "",
        bodyMd: a.body_md,
        feature: a.feature ?? "",
        routePrefix: a.route_prefix ?? "",
        keywords: a.keywords.join(", "),
      },
    });
  }

  function save() {
    if (!editing) return;
    start(async () => {
      const res = await saveManualArticle(editing.form, {
        slug: editing.slug,
        resolveGapId: editing.gapId,
      });
      if (res.ok) {
        toast.success("Artículo guardado e indexado");
        setEditing(null);
      } else {
        toast.error(res.message);
      }
    });
  }

  const open = gaps.filter((g) => g.hits > 0);

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------------- huecos -- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Preguntas sin respuesta</h2>
            <p className="text-sm text-muted-foreground">
              Lo que la gente preguntó y el asistente no supo contestar, agrupado
              por similitud. Si algo se repite mucho, puede que el problema no sea
              la documentación sino el producto.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openNew()}>
            <Plus /> Artículo nuevo
          </Button>
        </div>

        {open.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No hay preguntas sin respuesta. Cuando el asistente no sepa algo, va a
            aparecer acá.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {open.map((g) => (
              <Card
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium">{g.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.hits} {g.hits === 1 ? "vez" : "veces"}
                    {g.role ? ` · rol ${g.role}` : ""} ·{" "}
                    {g.created_at.slice(0, 10)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => openNew(g)}>
                    Escribir la respuesta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      start(async () => {
                        await dismissGap(g.id);
                        toast.success("Descartada");
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- artículos -- */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Artículos ({articles.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Los de tipo <strong>Repo</strong> y <strong>Generado</strong> se
            actualizan solos con <code className="text-xs">pnpm kb:build &amp;&amp; pnpm kb:sync</code>.
            Sólo los <strong>Manual</strong> se editan desde acá.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {articles.map((a) => {
            const meta = SOURCE_META[a.source];
            return (
              <Card key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                      {meta.label}
                    </Badge>
                    <span className="truncate text-sm font-medium">{a.title}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.chunks} fragmentos ·{" "}
                    {a.audience_roles ? a.audience_roles.join(", ") : "todos los roles"}
                    {a.source_path ? ` · ${a.source_path}` : ""} · actualizado{" "}
                    {a.updated_at.slice(0, 10)}
                  </p>
                </div>
                {a.source === "manual" ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        start(async () => {
                          const res = await deleteManualArticle(a.slug);
                          if (res.ok) toast.success("Borrado");
                          else toast.error(res.message);
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {meta.hint}
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------- editor -- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                {editing.slug ? "Editar artículo" : "Artículo nuevo"}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditing(null)}
              >
                <X />
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-title">Título</Label>
              <Input
                id="kb-title"
                value={editing.form.title}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, title: e.target.value },
                  })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-summary">Resumen (una línea, es lo que se cita)</Label>
              <Input
                id="kb-summary"
                value={editing.form.summary ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, summary: e.target.value },
                  })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-body">
                Cuerpo (markdown: los <code>##</code> definen cómo se trocea)
              </Label>
              <Textarea
                id="kb-body"
                rows={14}
                className="font-mono text-xs"
                value={editing.form.bodyMd}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, bodyMd: e.target.value },
                  })
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-keywords">
                  Palabras clave (separadas por coma)
                </Label>
                <Input
                  id="kb-keywords"
                  value={editing.form.keywords ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, keywords: e.target.value },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-route">Ruta con la que se relaciona</Label>
                <Input
                  id="kb-route"
                  placeholder="/admin/leads"
                  value={editing.form.routePrefix ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: { ...editing.form, routePrefix: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Guardar e indexar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

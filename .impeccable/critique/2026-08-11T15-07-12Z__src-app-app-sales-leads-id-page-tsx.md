---
timestamp: 2026-08-11T15-07-12Z
slug: src-app-app-sales-leads-id-page-tsx
---
# Critique — Ficha de lead (vendedor) + Carga de leads

Method: dual-agent (A: design review, isolated · B: detector + evidence, isolated)
Mode: Operate
Date: 2026-08-11
Targets:
- `src/app/(app)/sales/leads/[id]/page.tsx` (primary)
- `src/components/leads/lead-form.tsx`

## Design Health Score — 20/40 (todas las 10 heurísticas aplican)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | status-changer.tsx:39 descarta isPending; no hay "última actividad hace X" |
| 2 | Match System / Real World | 3 | Source/Medium/Campaign sin traducir (tracking-card.tsx:77-85); quote llamada #a3f4b1c9 |
| 3 | User Control and Freedom | 2 | status-changer.tsx:41 dispara irreversible sin confirmación ni undo |
| 4 | Consistency and Standards | 2 | 2 cards con ícono de acento, 4 sin; dos dialectos de "nota"; ignora LeadsPageHeader |
| 5 | Error Prevention | 1 | lead-form.tsx:116 es div no form; submits type=button; requeridos en hint gris |
| 6 | Recognition Rather Than Recall | 2 | dos selects sin label de 176px lado a lado en el header |
| 7 | Flexibility and Efficiency | 1 | teléfono es un div (page.tsx:277), sin tel: ni copiar |
| 8 | Aesthetic and Minimalist Design | 1 | 11 bloques en una columna, 6+ Cards idénticas; UTM en posición 9 |
| 9 | Error Recovery | 2 | actions.ts:788 devuelve error.message de Postgres en inglés |
| 10 | Help and Documentation | 3 | fortaleza real: copy de composer y de diálogos en vos |

## Design specificity verdict

Genérico. Sacando los strings en español, es la página de detalle de entidad
que viene con cualquier scaffold CRUD: una columna, N Cards idénticas, un
primitivo Detail label/valor repetido en grid-cols-2, y un hilo de comentarios
abajo. Cambiando "Vehículo de interés" por "Propiedad" es un CRM inmobiliario.

El conocimiento de concesionaria EXISTE en el código y es bueno
(next-best-action.ts, el usado en parte de pago, el gate de triple check,
WhatsApp-first, temperatura) pero casi nada se expresa visualmente.

## Deterministic scan

detect.mjs: exit 0, `[]`, 0 findings sobre 27 archivos. Validado con canary
(detector sí parsea .tsx y sí dispara). El rule set del detector es
slop/tipografía/easing: no cubre layout, IA ni dark mode, así que el cero no
contradice los hallazgos de abajo.

Browser overlay: SKIPPED — no había server en 127.0.0.1:3000 y la ruta está
detrás de login. Sin evidencia de render en vivo.

## Priority issues

P1 — Stack plano de cards sin agrupación ni ritmo (page.tsx:270-507).
   11 bloques en una columna a gap-4, 6+ son el mismo componente con el mismo
   padding/radius/border/shadow, diferenciados solo por un string de título.
   page.tsx:270-271 anida flex-col gap-4 dentro de flex-col gap-4.

P2 — Orden vertical invertido respecto del trabajo real.
   Actividad (lo que el vendedor viene a buscar) es lo último, debajo de los
   UTM. El teléfono es quinto y no es clickeable. La NBA card sabe la acción y
   no ofrece botón, aunque next-best-action-card.tsx:79 existe para eso.

P3 — lead-form.tsx sin bloques y sin prevención de error.
   Section (396-408) es un h3 + campos: 15 campos en una corrida gris. No es
   un form, submits type=button, Enter no hace nada, requeridos en hint gris,
   budget_min > budget_max se acepta.

P4 — Dark mode roto en casi todos los badges (clase de defecto real).
   16+ instancias de bg-blue-100/bg-amber-100/bg-emerald-100 sin variante dark:
   incluyendo el badge de estado y el de temperatura de la propia ficha.
   Además text-warning-foreground sobre bg-warning/10 = negro sobre negro en
   dark, y ahí vive el mensaje "Esperando aprobación del gerente".

P5 — Mobile: 4 grid-cols-2 sin prefijo responsive; selects w-44 fijos.

## What's working

1. lib/next-best-action.ts + next-best-action-card.tsx — motor de reglas puro,
   auditable, con escala de tono de 4 niveles basada en tokens. El único lugar
   donde el color carga significado sistemáticamente.
2. activity-section.tsx:326-341 — colapsar notas+tareas+visitas en Pendiente /
   Historial es el modelo de información correcto para un lead.
3. leads-page-header.tsx + kpi-card.tsx — el lenguaje de bloques ya existe y es
   reusable. El problema no es el sistema: la ficha no lo consume.

## Decisión del usuario

Ambición elegida: "Bloques + jerarquía (conservador)" — mantener una columna y
el lenguaje de Cards, agregar título de sección, filete de acento y color con
significado. La recomendación de Assessment A era dos carriles con panel
sticky; queda como follow-up, no se aplica contra el brief.

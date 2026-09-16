# Reparto de leads

Quién atiende cada lead que entra, por dónde se configura, y por qué el motor
tiene tres estrategias cuando la pantalla muestra cuatro opciones.

Reescrito el **16/09/2026**. Antes de esta fecha cada puerta de entrada repartía
con su propio mecanismo.

## El problema que resolvió

Había cinco caminos de asignación, cuatro funciones en la base y vocabulario
incompatible entre pantallas — "automático" significaba cosas distintas en el
importador y en Lead Ads. Y dos entradas que directamente no repartían:

| Entrada | Antes | Config |
|---|---|---|
| Meta Lead Ads | `assign_lead_from_form`, 4 modos pegados a la tabla | sólo acá |
| Formulario propio | `auto_assign_lead` | ninguna |
| Google Sheets | **nada** — al pool, sin que se notara | ninguna |
| Carga masiva | `bulk_assign_leads` | por corrida, no se guardaba |
| WhatsApp / redes | `assign_conversation_to_active_vendor` | global de empresa |
| Carga manual | `auto_assign_lead` | ninguna |

Agregar "70% a Juan" significaba tocar cinco lugares.

## El modelo

Una **regla** es una entidad con nombre (`assignment_rules`). Cada origen apunta
a una con `assignment_rule_id`; en `null` usa la regla de la empresa
(`is_default`). Una sola función —`assign_lead`— decide siempre.

La config NO vive pegada a cada origen a propósito. Con cinco tablas de cinco
formas distintas, el motor tendría que saber leer las cinco: eso es lo frágil.

## Tres estrategias, cuatro opciones

En la base hay **tres**:

- **`balanced`** — el vendedor con menos leads abiertos, dentro de la gerencia
  (sucursal + tipo). Delega en `auto_assign_lead`, o sea es literalmente el
  comportamiento histórico.
- **`turns`** — rueda determinística con pesos.
- **`pool`** — sin asignar.

En la pantalla se ven **cuatro**, porque *"siempre al mismo vendedor"* es una
rueda de un solo lugar: la misma estrategia `turns` con un miembro. Separarlas
en la UI es lo que el usuario entiende; unirlas en el motor es lo que hace que
haya dos caminos de código para testear y no cuatro.

`strategyOf()` y `modeOf()` en `src/lib/assignment-rules.ts` hacen la traducción.

## La rueda

Los turnos se **intercalan**, no se agrupan. Con 70/30 el reparto es
`J P J J J P J J P J`, no siete Juan seguidos y después tres Pedro.

Cada vendedor con peso `w` ocupa las posiciones `(k + 0.5) / w` para `k` en
`0..w-1`; al ordenar esas fracciones los turnos quedan mezclados parejo. Es
determinístico y no guarda estado por miembro — sólo un cursor por regla.

Si fuera random ponderado, sobre 10 leads el 70/30 daría 7/3 **en promedio**:
puede dar 9/1 y el vendedor se queja el mismo día, con razón.

**La rueda está implementada dos veces**, en `assignment_wheel()` (SQL, la que
reparte) y en `buildWheel()` (TS, la que dibuja el preview del diálogo). Tienen
que dar lo mismo: un preview que no coincide con el reparto real es peor que no
tener preview. Hay un test que las compara.

Los pesos se simplifican por su MCD antes de guardar (`reduceWeights`): 70/30 se
guarda como 7/3. Si no, la rueda tendría 100 lugares y el preview de "los
próximos 10" mostraría un tramo y no el ciclo completo.

## La invariante

> Si en el momento del lead nadie califica, va al pool.

No es una opción configurable, y es a propósito: convertirla en regla fija
elimina la posibilidad de configurarla mal. Nunca se pierde un lead, y nunca se
le da a alguien que no fue elegido.

"Nadie califica" pasa cuando a los vendedores de la regla los dieron de baja, o
cuando la lista quedó vacía. **No cae de vuelta a `balanced`**: si alguien
configuró a mano quién atiende un origen, sorprenderlo con otro vendedor es peor
que dejar el lead visible en el pool.

## Dónde se configura

**Configuración → Reparto de leads** (`/admin/reparto`) lista *todas* las
entradas con su regla, agrupadas por tipo, y la regla de la empresa arriba. Los
formularios de Meta además siguen teniendo su botón en Integraciones → Lead Ads,
con el mismo diálogo.

Cada origen es dueño de su regla: no se comparten entre orígenes. El reuso pasa
por la regla de la empresa, que es la que usan todos los que no tienen una
propia — el caso común. Compartir reglas con nombre entre varios orígenes se
puede agregar después sin migración.

## WhatsApp y redes: la conversación, no el lead

El inbox reparte **conversaciones**, no leads. El lead después sigue a la
conversación (eso ya era así). Por eso hay una función aparte,
`assign_conversation_by_rule`, que aplica la misma regla sobre la conversación.

Sin regla propia o con `balanced` delega en `assign_conversation_to_active_vendor`:
presencia del call center, con sus horarios y su tope de overflow, exactamente
como siempre. Con `turns` manda la rueda.

## Carga masiva

Un lote de 3000 no se puede asignar de a uno: serían 3000 round-trips y el
timeout de la función serverless. `assign_leads_bulk` mapea `row_number()` del
lote contra la misma rueda, en una sentencia, así el % sale igual que lead a lead.

La corrida sigue eligiendo su distribución en el importador; "round-robin" ahora
significa "la regla de la empresa", así que si el admin la pasa a 70/30 la carga
masiva lo sigue sin tocar nada.

## Migración

El backfill dejó **todo con el comportamiento que ya tenía**:

- Una regla `Equilibrado` (default) por empresa → la usan formularios propios,
  canales, carga manual y los formularios de Meta que estaban en "automático".
- Una regla `Sin asignar` por empresa → **Google Sheets apunta acá**, porque
  antes no asignaba. Sin esto, heredar la default los habría hecho repartir de
  golpe: un cambio de comportamiento silencioso.
- Los formularios de Meta en `fixed` / `round_robin` pasaron a reglas `turns`
  con sus vendedores y pesos iguales.

`lead_ad_forms.assignment_mode`, `.assigned_user_id`, `.rr_cursor` y la tabla
`lead_ad_form_vendors` quedaron **obsoletas**: el código ya no las lee. No se
borraron en la misma migración a propósito — primero que corra en producción.

## Pendiente

- Compartir una regla entre varios orígenes (hoy cada uno tiene la suya).
- Auditoría: no hay forma de responder *"¿por qué este lead le tocó a Juan?"*.
  Con round-robin nadie pregunta; con % y varias reglas, el gerente lo va a
  preguntar. Una tabla con lead, regla, vendedor y motivo lo resolvería.
- Limpiar las columnas obsoletas de `lead_ad_forms`.

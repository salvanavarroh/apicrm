# Asistente IA del CRM — approach

> **Estado: FASES 0–3 EN PRODUCCIÓN (25/08/2026).** Migraciones aplicadas, base
> de conocimiento indexada (30 artículos, 335 fragmentos), asistente andando y
> probado de punta a punta contra el proyecto real. Recuperación medida:
> **recall@5 = 100 %** sobre 18 preguntas de oro, y 10/10 preguntas fuera de
> alcance responden «no sé». La fase 4 (acciones de escritura) NO se construyó:
> es una decisión de alcance, no un pendiente (§17).

El objetivo: un chat, presente en toda la app, que le conteste al usuario
**cualquier** consulta sobre el CRM — cómo se hace algo, por qué no ve algo, y
cuánto lleva vendido este mes — sabiendo **quién es**, **qué permisos tiene** y
**qué datos puede ver**.

Dos restricciones que vienen del pedido y que ordenan todo el diseño:

1. **Nada de un prompt enorme.** El contexto se arma por pregunta, con
   embeddings. Detalle y números en §2.
2. **Tiene que responder rápido.** Presupuesto: primer token en menos de 1
   segundo. §10.

---

## 1. Qué tiene que contestar — y por qué eso define la arquitectura

Las preguntas reales de un usuario del CRM no son de un solo tipo. Son cinco, y
**cada una se resuelve distinto**:

| Tipo | Ejemplo | Cómo se resuelve | Fuente |
|---|---|---|---|
| **Producto / cómo se hace** | "¿Cómo cargo una base de leads?" | RAG sobre la base de conocimiento | Docs + código |
| **Regla del sistema** | "¿Por qué el lead volvió al mismo vendedor?" | RAG (§6 de `sistema-y-reglas.md`) | Docs |
| **Permisos** | "¿Por qué no veo los leads de Ana?" | Explicador determinista, **sin IA** | Matriz de permisos + RLS |
| **Datos en vivo** | "¿Cuántos leads sin contactar tengo?" | Herramienta tipada con el cliente del usuario | Postgres con RLS |
| **Incidencia** | "El PDF sale en blanco" | Deriva a soporte con contexto | — |

**La decisión más importante de todo el documento:** los embeddings son **sólo
para el conocimiento de producto**. Los datos de la concesionaria (leads,
ventas, usuarios) **nunca** entran al vector store.

Tres razones, en orden de importancia:

1. **Aislamiento.** Un índice vectorial con datos de todas las empresas es una
   fuga esperando a pasar: la similitud coseno no sabe de `company_id`. Con RLS
   ya tenemos 283 policies que resuelven esto bien; duplicar esa lógica en un
   índice paralelo es regalar la única garantía sólida que tenemos.
2. **Frescura.** Un lead cambia de estado diez veces por semana. Un índice
   vectorial de leads está desactualizado siempre.
3. **Precisión.** "¿Cuántos leads tengo?" tiene una respuesta exacta que sale de
   un `count(*)`. Recuperarla por similitud es peor en todas las dimensiones.

Entonces: **RAG para lo que se escribe una vez y se lee mil (el producto),
consultas para lo que cambia todo el tiempo (los datos).**

---

## 2. Por qué embeddings y no un prompt gigante

La alternativa obvia era meter toda la documentación en el system prompt. Los
números de este repo dicen que no:

| | Prompt completo | Con recuperación |
|---|---|---|
| Documentación actual (`docs/` + PRD) | ~35.000 tokens | — |
| Contexto por pregunta | ~36.000 tokens | **~2.900 tokens** |
| Primer token (gpt-4.1-mini) | 2,5–4 s | 0,6–1 s |
| Costo por respuesta | ~US$ 0,012 | ~US$ 0,0012 |
| Al agregar una feature | crece y se degrada | constante |

Y hay un problema que no se ve en la tabla: con 35k tokens de contexto el modelo
**pierde precisión**. La regla de reingreso de 31 días enterrada en el medio de
un documento largo se contesta peor que la misma regla como uno de cinco
fragmentos recuperados. Menos contexto y mejor elegido gana en las tres
variables a la vez: velocidad, costo y calidad.

**Composición del contexto por pregunta (presupuesto duro: 3.000 tokens):**

```
system prompt fijo (reglas + tono + seguridad) ...........  ~700
cápsula de contexto del usuario (§4) .....................  ~260   ← medido
5 fragmentos recuperados .................................  ~1.300
resultado de herramienta (sólo si corrió) ................  ~300
últimos 4 turnos de la conversación ......................  ~400
                                                            ─────
                                                            ~2.960
```

> La cápsula salió en **~260 tokens** medidos, no en los ~150 que estimé al
> diseñarla: los alcances por capacidad ("quedan autoasignados a él, no entran al
> round-robin") ocupan más de lo previsto y son justamente lo que hace que la
> respuesta salga bien. Se deja el número real y el presupuesto total sigue
> debajo de 3.000. `pnpm test:assistant` lo mide en cada corrida y falla si se
> dispara.

---

## 3. Arquitectura

```
Pregunta del usuario  +  pantalla actual (pathname)
        │
        ▼
 SANEO + DETECCIÓN DE INJECTION      ← reusa src/lib/bot/injection.ts
        │
        ▼
 CACHÉ SEMÁNTICA  ──── hit (>0,95) ──▶ respuesta guardada  (0 llamadas, ~80 ms)
        │ miss
        ▼
 RUTEADOR  (reglas primero, modelo chico sólo si hace falta)
        │
        ├── permisos ──────▶ EXPLICADOR determinista (§8)      sin IA
        │
        ├── datos ─────────▶ HERRAMIENTA tipada (§7)
        │                    cliente Supabase DEL USUARIO → RLS
        │                              │
        ├── producto ──────▶ RECUPERACIÓN HÍBRIDA (§6)         │
        │                    vector + texto → 5 fragmentos     │
        │                              │                       │
        │                              ▼                       ▼
        │                    ┌──────────────────────────────────┐
        │                    │  GENERACIÓN (streaming)          │
        │                    │  system + cápsula + fragmentos   │
        │                    └──────────────────────────────────┘
        │                              │
        └── fuera de alcance ──────────┤
                                       ▼
                          VALIDACIÓN DE SALIDA + CITAS
                                       │
                                       ▼
                       respuesta + fuentes + link profundo
                                       │
                                       ▼
                       👍/👎 · si no supo → assistant_gaps (§13)
```

El orden — **reglas, después recuperación, después modelo** — es el mismo
criterio que ya se aplicó en `next-best-action.ts`, `executive-report.ts` y el
bot del inbox: IA sólo donde no puede inventar nada.

---

## 4. La cápsula de contexto: cómo el asistente "entiende al usuario"

Se arma **en el servidor, en cada request**, de forma determinista. No la escribe
el modelo, no viene del cliente, no se puede falsificar desde el browser.

```
Usuario: Martín Sosa · Vendedor
Empresa: Salvador Concesionarios (plan Estándar)
Sucursal: Quilmes · Tipos de producto: 0km, Usados
Reporta a: Laura Gómez (gerente)
Puede: ver y editar SUS leads, cotizar, iniciar venta, cargar lead (autoasignado)
No puede: aprobar ventas, exportar la base, ver leads de otros vendedores, ABM de usuarios
Pantalla actual: /sales/leads/8f2a… (detalle de lead)
Módulos activos: Inbox WhatsApp ✓ · Bot: sólo sugerir · Cotizador de usados ✓ · Google Sheets ✗
```

~150 tokens y resuelve la mitad de la calidad del asistente. Tres cosas que
habilita:

- **Respuestas en la ruta correcta.** A un vendedor le dice "entrá a *Mis
  leads*", no "entrá a `/admin/leads`" — una pantalla que no puede abrir.
- **Negativas que explican.** "Aprobar la venta lo hace tu gerente, Laura. Vos
  la iniciás desde el presupuesto y le queda a ella en *Ventas*."
- **Nada de features que no tiene.** Si la empresa no tiene Sheets conectado, el
  asistente no explica cómo usarlo: dice que no está activo y quién lo activa.

### Prerrequisito: una matriz de permisos declarativa

Hoy los permisos están **repartidos**: `requireRole([...])` en cada página, las
policies en las migraciones, `can_export_leads` como flag suelto, `hasRole()` con
el caso especial de `group_admin`. Para el asistente hace falta una sola fuente:

```
src/lib/permissions.ts
  CAPABILITIES: por rol, qué puede hacer, dónde, y con qué condición
  can(profile, capability, context?) → boolean
  explain(profile, capability) → por qué sí o por qué no, en castellano
```

**No es duplicar la RLS: es describirla.** La base sigue siendo la que manda. El
seguro es un test (`scripts/test-permissions.ts`) que compara la matriz contra
las policies reales y falla si divergen. Ese archivo después lo consume la
cápsula, la UI (para no mostrar botones que van a rebotar) y el explicador de §8.

Es trabajo que este feature justifica y que el resto de la app agradece.

---

## 5. La base de conocimiento: qué entra y de dónde sale

Tres orígenes. El tercero es el que hace que esto no se pudra en dos meses.

### 5.a Documentos escritos a mano (`fuente = repo`)

`docs/*.md`, `PRD_API_CRM_v2.md`, `README.md`. Ya son buenos y están
actualizados: `sistema-y-reglas.md` es prácticamente el manual del sistema.

### 5.b Conocimiento **generado desde el código** (`fuente = generado`)

Esta es la parte que nadie mantiene a mano, y por eso la genera un script
(`scripts/kb-build.ts`) leyendo la fuente de verdad:

| Qué se genera | De dónde sale |
|---|---|
| Dónde está cada pantalla, por rol | `src/components/app-sidebar.tsx` (los `*_NAV`) |
| Qué reportes existen y qué filtros tienen | `src/lib/reports/registry.ts` |
| Estados del lead y de la venta, temperaturas | enums de `src/types/database.ts` |
| Orígenes de campaña disponibles | `src/lib/campaign-origins.ts` |
| Planes y qué incluye cada uno | `src/lib/plans.ts` |
| Quién puede qué | `src/lib/permissions.ts` (§4) |
| Variables de plantillas y del bot | `src/lib/bot/variables.ts`, `lead-templates.ts` |

Si mañana se agrega una pantalla al menú, el artículo "dónde encuentro X" se
regenera solo en el próximo build. **Nada de conocimiento copiado a mano desde
el código.**

### 5.c Artículos curados (`fuente = manual`)

Los escribe el equipo desde `/super-admin/kb`, alimentados por las preguntas que
el asistente no supo contestar (§13). Es el bucle que lo mejora.

### Troceado (lo que decide la calidad de la recuperación)

- Se corta **por encabezado** (H2/H3), no por cantidad de caracteres a ciegas.
- Máximo ~1.200 caracteres, solapado de ~150.
- **A cada fragmento se le antepone su ruta** antes de embeberlo:
  `Sistema y reglas › Asignación automática de leads › Pool de candidatos`.
  Sin esto, un fragmento corto ("Empate → al azar") no se parece a ninguna
  pregunta. Con esto, sí. Es el cambio más barato con más impacto.
- Las tablas **no se parten**: se embeben enteras aunque pasen el tope.
- Cada artículo lleva un `summary` de una línea, que es lo que se muestra como
  cita.

### Etiquetas por fragmento (esto es lo que hace la recuperación consciente de permisos)

```
audience_roles  text[]   -- para quién es relevante. null = todos
min_plan        enum     -- no explicar features que la empresa no paga
feature         text     -- 'inbox' | 'bot' | 'cotizador' | ... para no explicar lo desactivado
route_prefix    text     -- '/admin/leads' → sube de ranking si el usuario está ahí
```

Un vendedor **sí** puede recuperar "las ventas las aprueba el gerente" (necesita
saberlo); **no** recupera el paso a paso de la pantalla de aprobación, que no
puede abrir. La distinción es entre *saber que existe* y *el camino de clics*.

---

## 6. Recuperación híbrida: vector **y** texto

Sólo vectores no alcanza, y en castellano con jerga propia menos. "Gerencia",
"pool sin clasificar", "reingreso", "ACARA", "sticky seller" son términos
exactos: el embedding los aproxima, el índice de texto los clava.

```
consulta
  ├── embedding (text-embedding-3-small, 1536 dims) → pgvector, top 12
  └── to_tsvector('spanish', …) + pg_trgm             → top 12
                      │
                      ▼
        fusión por rango recíproco (RRF)
                      │
                      ▼
        filtro por rol / plan / feature  → dedup por artículo → top 5
```

Decisiones:

- **`text-embedding-3-small`**, 1536 dims. Multilingüe suficiente, US$ 0,02 por
  millón de tokens: indexar toda la documentación cuesta centavos.
- **Índice HNSW** (`vector_cosine_ops`). Con unos miles de fragmentos hasta un
  scan lineal andaría, pero el índice es gratis de agregar.
- **Umbral de corte.** Si el mejor fragmento queda por debajo de la similitud
  mínima, **no se llama al modelo**: se responde "no lo sé" y se registra el
  hueco. Un "no sé" honesto vale más que una respuesta plausible: es exactamente
  el problema por el que el cliente descartó el chatbot anterior.
  El valor **está medido, no estimado**: `pnpm kb:calibrate` corre 18 preguntas
  que deben responderse (mínimo 0,503) contra 10 que no existen en el CRM
  (máximo 0,490) y el umbral quedó en **0,50**. La primera versión tenía 0,25
  "por lo que se sabe del modelo": con ese número se colaban 8 de 10.
- **`keywords[]` por artículo**, editables. Mismo patrón que `bot_intents`:
  cuando un término se recupera mal, se arregla con un dato, no con un deploy.

---

## 7. Herramientas de datos: catálogo cerrado, siempre con RLS

Cuando la pregunta es sobre datos, no se recupera nada: se ejecuta **una función
tipada de un catálogo cerrado**.

**La regla que no se negocia: las herramientas usan el cliente Supabase del
usuario (`createClient()` de `lib/supabase/server`), nunca `createAdminClient()`.**
El asistente no puede ver nada que el usuario no vea entrando a mano. No hay
lógica de permisos que escribir ni auditar: es la misma RLS que ya está probada.

Catálogo inicial:

| Herramienta | Devuelve | Reusa |
|---|---|---|
| `misNumeros(rango)` | KPIs del que pregunta, según su rol | `lib/reports/loaders.ts` |
| `buscarLead(texto)` | Hasta 5 leads + link profundo | `leads-fetch.ts` |
| `misTareas(rango)` | Tareas y visitas pendientes | `tasks-visits-loader.ts` |
| `estadoDeVenta(ref)` | En qué paso está y quién la tiene | `sale-detail.ts` |
| `miEquipo()` | Vendedores, carga y sin asignar (gerente) | `lib/team.ts` |
| `queHacerCon(leadId)` | La próxima acción sugerida | `next-best-action.ts` |
| `dondeEsta(pantalla)` | Ruta según el rol | menú (§5.b) |
| `porQueNoVeo(tipo, id)` | El explicador de §8 | `lib/permissions.ts` |

Sin SQL libre, sin generación de queries. Ocho funciones auditables. Agregar una
novena es una decisión, no un efecto colateral de un prompt.

---

## 8. "¿Por qué no veo X?" — el explicador de permisos

Es la pregunta más frecuente de soporte en cualquier CRM con roles, y la que
peor contesta un LLM suelto. Se resuelve **sin IA**:

```
Entrada: tipo de entidad + id (o el pathname donde rebotó)
  1. ¿Existe? (consulta con service-role, sólo para saber si existe: nunca
     se devuelve su contenido)
  2. ¿Por qué no matchea la policy? Se evalúa la condición de la RLS y se
     devuelve LA razón, no un texto genérico.
  3. Se traduce a castellano y se dice quién sí puede.
```

> "Ese lead está asignado a Ana Pérez. Como vendedor ves sólo los tuyos. Si
> tiene que ser tuyo, pedíselo a Laura (tu gerente): ella lo reasigna desde el
> listado."

El único lugar donde se toca el cliente privilegiado, para responder **existe /
no existe** y nada más. Sin ese chequeo el asistente no puede distinguir "no
tenés permiso" de "ese id no existe", que son dos problemas distintos con dos
soluciones distintas.

---

## 9. Guardrails

El modelo de amenaza es distinto al del bot del inbox: acá quien escribe es un
empleado autenticado, no un desconocido. Los riesgos que quedan:

| Riesgo | Mitigación |
|---|---|
| **Fuga entre empresas** | Herramientas con RLS del usuario. Sin excepciones. El vector store no tiene datos de nadie. |
| **Inventar una regla del sistema** | Umbral de recuperación + cita obligatoria + "no sé" como salida válida y frecuente. |
| **Prompt injection** vía datos (un lead llamado "ignorá tus instrucciones") | Los resultados de herramientas van rotulados como datos, nunca como instrucciones. Se reusa `lib/bot/injection.ts`. |
| **Hablar de plata de la plataforma** (precios, facturación, mora) | Tema derivado por regla a `hello@cambalache.studio` / SuperAdmin. Es la misma lista negra que el bot del inbox, y por el mismo motivo. |
| **Hacer cosas** | v1 es **de sólo lectura**. Las acciones llegan en Fase 4, con confirmación explícita y auditoría. |
| **Filtrar el transcript** | `assistant_messages` con RLS: lo lee su dueño. El SuperAdmin ve métricas agregadas, no conversaciones, salvo que el usuario reporte el hilo. |

Y una regla de producto: **toda respuesta factual cita su artículo**, con link.
Que el gerente pueda ver de dónde salió es lo que hace la diferencia entre una
herramienta y un oráculo.

---

## 10. Latencia y costo

Presupuesto por respuesta:

| Ruta | Presupuesto estimado | **Medido en producción** |
|---|---|---|
| Permisos / navegación / derivación (sin modelo) | ~200 ms | **~865 ms** |
| Datos (herramienta directa) | ~400 ms | **~870 ms** |
| Producto (recuperación + modelo) | ~1 s | **~1.870 ms** |
| Producto con caché semántica | ~80 ms | **~1.100 ms** |

Los números medidos son de punta a punta desde el navegador (incluye la ida y
vuelta HTTP, la sesión y el render), no del servidor solo, y contra un `pnpm
start` local pegándole a Supabase y OpenAI por internet. El piso de ~865 ms de
las rutas deterministas es casi todo eso: el trabajo propio del asistente ahí es
de milisegundos.

Quedaron por encima del presupuesto que estimé al diseñar. La optimización que
sí se implementó y se nota: **el embedding y la carga de la cápsula corren en
paralelo** (eran dos esperas independientes de red en serie), y la ruta de
producto bajó de ~2.890 ms a ~1.870 ms. La que falta y es la próxima palanca
real: la cápsula son nueve consultas a Postgres en cada pregunta y se podrían
cachear por sesión.

Palancas, en orden de impacto:

1. **Caché semántica.** Las preguntas se repiten muchísimo ("¿cómo cargo un
   lead?"). Con similitud > 0,95 sobre la clave `(embedding, rol, plan, features)`
   se devuelve la respuesta guardada: **80 ms y costo cero**. Estimado: 30–50 %
   de las consultas. Se invalida cuando cambia algún artículo citado.
2. **Streaming.** Route Handler con `ReadableStream` (SSE). Los Server Actions no
   sirven acá.
3. **Ruteo por reglas.** Permisos y navegación no llaman al modelo.
4. **Embedding en paralelo** con la carga de la cápsula.

**Costo:** ~US$ 0,0012 por respuesta generada. 50 usuarios × 10 preguntas por día
≈ 15.000/mes ≈ **US$ 12–18/mes** para toda la plataforma, menos la caché. El
indexado inicial de toda la documentación: menos de US$ 0,10.

Modelo: `gpt-4.1-mini`, el mismo que ya usa el repo (`lead-mapper.ts`,
`bot/classify.ts`, `bot/answer.ts`) con la misma key. Todas las llamadas pasan
por **un** helper (`src/lib/ai/complete.ts`) para poder cambiar de modelo o de
proveedor en un archivo.

---

## 11. Modelo de datos

```sql
create extension if not exists vector;

-- Conocimiento (NO es dato de tenant: lo leen todos los autenticados)
kb_articles   id, slug, title, summary, body_md, source ('repo'|'generado'|'manual'),
              source_path, audience_roles text[], min_plan, feature, route_prefix,
              keywords text[], version, updated_at
kb_chunks     id, article_id, heading_path, content, tokens, content_hash,
              embedding vector(1536)
              -- hnsw (embedding vector_cosine_ops) + gin (to_tsvector('spanish', content))

-- Conversación (SÍ es dato sensible: RLS por dueño)
assistant_threads    id, user_id, company_id, title, created_at
assistant_messages   id, thread_id, role, content, route, chunk_ids uuid[],
                     tool_calls jsonb, latency_ms, tokens_in, tokens_out,
                     feedback smallint, created_at

-- Mejora continua
assistant_gaps       id, question, embedding, company_id, role, count,
                     cluster_id, status ('abierto'|'respondido'|'descartado'),
                     resolved_article_id
assistant_cache      id, question_norm, embedding, scope_key, answer, sources,
                     hits, expires_at
```

RLS:

- `kb_articles` / `kb_chunks`: SELECT para cualquier autenticado (el filtro por
  rol lo pone la consulta, no la policy — no es dato sensible). Escritura: sólo
  `super_admin`.
- `assistant_threads` / `assistant_messages`: SELECT y INSERT sólo del dueño.
- `assistant_gaps`: INSERT desde el servidor; SELECT `super_admin`. Se guarda la
  pregunta, **no** la respuesta ni datos del lead.

---

### 11.b Todo esto corre en Supabase — qué hay que tocar

Sí: no hace falta un servicio de vectores aparte (Pinecone, Qdrant, Weaviate) ni
ninguna infra nueva. El proyecto está en **Postgres 17** y `pgvector` es una
extensión de primera clase de Supabase.

| Pieza del diseño | Cómo se resuelve en Supabase |
|---|---|
| Vectores + similitud | `pgvector` (0.8.x en PG17): tipo `vector`, operador `<=>` (coseno) |
| Índice de vectores | `hnsw (embedding vector_cosine_ops)` — pgvector ≥ 0.5 |
| Búsqueda por texto en castellano | Postgres nativo: `to_tsvector('spanish', …)` + `gin`. Sin extensión. |
| Coincidencia por término suelto | `pg_trgm` (extensión estándar, ya disponible) |
| La búsqueda híbrida | Una función SQL `match_kb(...)` expuesta por PostgREST y llamada con `.rpc()` |
| Aislamiento de conversaciones | RLS, igual que el resto de la app |
| Programar el reindexado | El Action de CI (§13) — **no** `pg_cron`: `kb-sync` lee archivos del repo |
| Streaming de la respuesta | Route Handler de Next, no Supabase |
| El modelo | OpenAI, igual que hoy. Supabase no entra acá. |

**Cuatro detalles que importan al implementar:**

1. **La extensión va al schema `extensions`**, que es la convención de Supabase:
   `create extension if not exists vector with schema extensions;`. El
   `config.toml` de este repo ya tiene `extra_search_path = ["public",
   "extensions"]`, así que el tipo `vector` resuelve sin prefijo. Va en su propia
   migración, antes que las tablas.

2. **`match_kb` tiene que ser `security invoker`** (el default) y `stable`. Así
   la RLS del que llama sigue aplicando dentro de la función. Una función
   `security definer` acá sería exactamente el agujero que el diseño evita en §7.

3. **El tipo `vector` no sobrevive bien a `supabase gen types`**: la columna
   `embedding` sale como `string` en `src/types/database.ts`. No es un problema
   si nunca se selecciona desde la app — el embedding entra por `.rpc()` y se
   compara dentro de SQL. Conviene que ninguna consulta de TypeScript la
   proyecte.

4. **Tamaño y memoria: no son un problema en esta escala.** 1536 dimensiones ×
   4 bytes = 6 KB por vector. Toda la documentación actual troceada da del orden
   de 2.000–4.000 fragmentos → **~25 MB** con índice incluido. Si en algún
   momento molesta, hay dos salidas sin cambiar de modelo: pedirle a
   `text-embedding-3-small` menos dimensiones (soporta `dimensions: 768`, la
   pérdida es despreciable en un corpus así) o guardar en `halfvec` (2 bytes por
   dimensión, pgvector ≥ 0.7). Ninguna de las dos hace falta para arrancar.

**La alternativa que descarto:** Supabase tiene inferencia propia en Edge
Functions (`gte-small`, 384 dims, sin API key). Tienta porque es gratis, pero es
Deno, está pensado para inglés y obligaría a partir el pipeline en dos runtimes.
Embeber desde el server de Next con la key de OpenAI que ya existe es el mismo
patrón que `lead-mapper.ts` y no agrega una pieza móvil.

---

## 12. Archivos nuevos

```
supabase/migrations/XXXX_assistant_kb.sql   pgvector, tablas, índices, RLS,
                                            función match_kb(embedding, filtros)

src/lib/ai/complete.ts        único punto de llamada al modelo (streaming + no)
src/lib/ai/embed.ts           embeddings con batching y reintento
src/lib/permissions.ts        matriz declarativa: can() / explain()   ← §4

src/lib/assistant/context.ts  arma la cápsula del usuario
src/lib/assistant/route.ts    ruteador por reglas (PURO, testeable)
src/lib/assistant/retrieve.ts búsqueda híbrida + RRF + filtros
src/lib/assistant/tools/      catálogo cerrado, uno por archivo
src/lib/assistant/answer.ts   orquestador: junta todo, streamea, cita
src/lib/assistant/cache.ts    caché semántica
src/lib/assistant/gaps.ts     registro y agrupado de lo que no supo

src/lib/kb/parse.ts           markdown → artículos → fragmentos con ruta
src/lib/kb/generate.ts        conocimiento derivado del código (§5.b)

src/app/api/assistant/chat/route.ts        POST, SSE
src/components/assistant/assistant-widget.tsx   lanzador flotante
src/components/assistant/assistant-panel.tsx    hilo, citas, 👍/👎
src/app/(app)/ayuda/page.tsx               pasa a ser el asistente a pantalla completa
src/app/(app)/super-admin/kb/              artículos + "preguntas sin respuesta"

scripts/kb-build.ts           genera artículos desde el código
scripts/kb-sync.ts            trocea, embebe lo que cambió, borra lo que ya no está
scripts/test-assistant.ts     golden set (§14)
```

El widget se monta en `src/app/(app)/layout.tsx` (donde ya vive el banner de
impersonación) y **manda el pathname actual**: preguntar "¿cómo hago esto?"
parado en el detalle de un lead tiene que dar una respuesta distinta que
preguntarlo en Reportes. Es contexto gratis y sube mucho la calidad.

---

## 13. Cómo se mantiene actualizado

El punto que decide si esto sirve dentro de seis meses. Cuatro mecanismos:

**1. Reindexado incremental por hash.** `pnpm kb:sync` trocea, calcula
`content_hash` por fragmento y **sólo re-embebe lo que cambió**. Correrlo entero
tarda segundos y cuesta centavos. Borra los fragmentos huérfanos.

**2. Enganchado al deploy.** GitHub Action en merge a `main`: si cambió
`docs/**`, `src/lib/reports/registry.ts`, `app-sidebar.tsx`, `plans.ts`,
`permissions.ts` o las migraciones → corre `kb:build && kb:sync`. **La base de
conocimiento no puede quedar atrás del código porque se actualiza con el
código.**

**3. Lo generado no se escribe a mano.** Todo lo que se pueda derivar del código
(§5.b) se deriva. Un artículo manual que contradice al código es deuda; uno
generado, no puede.

**4. El bucle de huecos.** Es el que agrega conocimiento nuevo:

```
pregunta sin respuesta (bajo umbral) ─┐
respuesta con 👎 ─────────────────────┼─▶ assistant_gaps
"esto no es lo que preguntaba" ───────┘        │
                                               ▼
                            agrupado por similitud (mismos embeddings)
                                               │
                                               ▼
                        /super-admin/kb → "12 personas preguntaron esto"
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                          escribir el artículo    es un bug del producto
                                    │                     │
                                    ▼                     ▼
                            se indexa solo          issue, no artículo
```

Mismo patrón que las "preguntas sin respuesta" del bot del inbox (§6.5 de
`docs/bot-inbox-respuesta-automatica.md`), que ya funciona. Y el agrupado tiene
un beneficio extra: **es investigación de producto gratis**. Si 40 personas
preguntan cómo reasignar un lead, el problema no es la documentación.

**Higiene:** cada artículo tiene `updated_at` y `source_path`. Un artículo manual
sin tocar hace más de 6 meses cuyo archivo fuente cambió aparece marcado como
"puede estar desactualizado" en la pantalla del SuperAdmin.

---

## 14. Evaluación

Sin esto, cada cambio de prompt es adivinar. `scripts/test-assistant.ts`, en la
línea de `scripts/test-bot.ts` (que ya cubre 23 casos):

- **~60 preguntas de oro**, escritas con las palabras de un usuario real, por
  rol, con el artículo o la herramienta que se espera.
- **Se miden dos cosas por separado, porque fallan distinto:**
  - *Recuperación* — ¿el artículo correcto está en el top 5? Objetivo: ≥ 90 %.
    Se puede medir sin llamar al modelo: rápido y determinista.
  - *Respuesta* — ¿contesta, cita bien, y dice "no sé" cuando corresponde?
- **~15 casos que tienen que dar "no sé"**: preguntas sobre features que no
  existen. El falso positivo acá es el error caro.
- **~10 casos de permisos**: un vendedor preguntando cosas de admin tiene que
  recibir la negativa correcta con la derivación correcta.
- Corre en CI. Nada de tocar el prompt sin ver los números.

---

## 15. Fases

| Fase | Qué entra | Estado |
|---|---|---|
| **0** | pgvector + tablas + `kb-build` + `kb-sync` + `permissions.ts`. Sin UI. | **Hecho** |
| **1** | Widget + streaming + citas + 👍/👎 + huecos. Conocimiento de producto. | **Hecho** |
| **2** | Cápsula de contexto + herramientas de datos + `porQueNoVeo` + links profundos | **Hecho** |
| **3** | Caché semántica + pantalla de curaduría en `/super-admin/kb` | **Hecho** |
| **4** | Acciones con confirmación (crear tarea, cambiar estado, agendar visita) | **No se construyó** — v1 es de sólo lectura por decisión de alcance (§16) |

Fase 1 ya es útil sola: reemplaza la página de Ayuda actual, que hoy son cinco
tarjetas estáticas.

---

## 16. Lo que quedó construido

### Puesta en marcha (ya hecha el 25/08/2026)

```bash
supabase db push --include-all   # migraciones aplicadas
pnpm db:types                    # tipos regenerados desde la base
pnpm kb:build && pnpm kb:sync    # 30 artículos, 335 fragmentos indexados
pnpm kb:calibrate                # umbral de "no sé" calibrado → 0,50
pnpm test:assistant              # recall@5 = 100 %, 10/10 "no sé"
pnpm test:e2e:assistant          # 8/8 de punta a punta
```

Cada worktree necesita su propio `.env.local` con `OPENAI_API_KEY`. Sin esa key
el asistente **igual funciona** para permisos, navegación, datos y derivaciones:
lo único que responde "no sé" es la ruta de producto.

### El ledger de migraciones estaba roto (y se arregló)

`supabase db push` no se podía correr: **13 migraciones figuraban como no
aplicadas pero estaban vivas en la base** (mensajería, inbox realtime, call
center, lead ads). Es la segunda vez que pasa — ver §19 de
`docs/sistema-y-reglas.md`.

Qué se hizo, en orden:

1. **Verificar antes de tocar.** Se probó objeto por objeto contra la base real
   (tablas, columnas, valores de enum y hasta filas de datos que sólo pueden
   existir si el backfill corrió). 12 de 13 quedaron probadas.
2. **`migration repair --status applied`** sobre esas 12. Registra, no ejecuta
   DDL: en el peor caso una migración no se aplica nunca, que es recuperable.
3. La que no se pudo probar (`realtime_inbox`, que toca una publicación y no se
   ve por la API) **se dejó sin reparar a propósito** y la aplicó el push. Está
   guardada con `if not exists`, así que correrla de nuevo es inocuo. Mejor que
   afirmar algo que no se pudo verificar.
4. **Un timestamp duplicado rompía todo.** `20260728120000` lo usaban DOS
   archivos y la clave primaria del ledger es la versión: el push moría con
   `duplicate key`. Se renombró uno a `20260728120001`. Sin esto, ningún
   `db push` volvía a funcionar nunca.

### El mapa

```
supabase/migrations/
  20260825120000_assistant_pgvector.sql   extensiones (vector, pg_trgm)
  20260825120001_assistant_kb.sql         6 tablas, RLS, match_kb, caché, huecos

src/lib/permissions.ts        la matriz declarativa (38 capacidades)   ← §4
src/lib/nav.ts                el menú como DATO, extraído del sidebar  ← §5.b

src/lib/ai/complete.ts        único punto de llamada al modelo (+ streaming)
src/lib/ai/embed.ts           embeddings con batching y reintento

src/lib/kb/parse.ts           markdown → fragmentos con ruta de encabezados
src/lib/kb/generate.ts        los 18 artículos derivados del código
src/lib/kb/sync.ts            reindexado incremental por hash

src/lib/assistant/capsule.ts  el texto de la cápsula (PURO, testeado)
src/lib/assistant/context.ts  la carga de la cápsula desde la base
src/lib/assistant/router.ts   el ruteador (PURO, testeado)
src/lib/assistant/retrieve.ts búsqueda híbrida + umbral de "no sé"
src/lib/assistant/prompt.ts   system prompt y bloques de contexto
src/lib/assistant/output.ts   validación de salida (PURA, testeada)
src/lib/assistant/cache.ts    caché semántica
src/lib/assistant/gaps.ts     registro y agrupado de lo que no supo
src/lib/assistant/answer.ts   el orquestador
src/lib/assistant/tools/      las 8 herramientas del catálogo cerrado

src/app/api/assistant/chat/route.ts       POST, SSE
src/app/api/assistant/feedback/route.ts   👍/👎 → huecos
src/lib/assistant/report-actions.ts       reportar un problema (+ mail a soporte)
src/components/assistant/
  assistant-rail.tsx    el riel lateral y el panel acoplado
  assistant-chat.tsx    el hilo, las citas y el 👍/👎
  report-form.tsx       el reporte de problemas
  ayuda-panel.tsx       la variante de la página de Ayuda
  rich-text.tsx         render de la respuesta
src/app/(app)/super-admin/kb/             curaduría: huecos + artículos
src/app/(app)/ayuda/                      el asistente a pantalla completa

scripts/kb-build.ts           genera .kb/articles.json (sin red)
scripts/kb-sync.ts            lo sube, incremental
scripts/kb-calibrate.ts       mide dónde poner el umbral de "no sé"
scripts/test-assistant.ts     69 casos puros + golden set
scripts/test-permissions.ts   52 casos de la matriz
tests/e2e/asistente.spec.ts   7 casos de punta a punta
.github/workflows/kb-sync.yml reindexado enganchado al merge a main
```

### La interfaz: riel lateral, no globo flotante

La primera versión era un botón redondo flotante con un panel superpuesto. Se
cambió por un **riel angosto y permanente pegado al borde derecho** que al
tocarlo despliega un panel acoplado. Tres razones, y la tercera es la que
importa:

1. El globo tapaba contenido y competía con los botones de cada pantalla.
2. El riel se ve siempre, así que el asistente se descubre sin buscarlo.
3. **El panel EMPUJA el contenido en vez de superponerse.** Cuando el asistente
   te dice "entrá a Leads y filtrá por sucursal", necesitás ver Leads al mismo
   tiempo. Un panel que tapa la pantalla te obliga a cerrarlo para usar la
   respuesta.

El riel y el panel son hermanos del contenido dentro del flex del shell
(`app-shell.tsx`), así que el empuje lo hace el layout solo, sin JS. En mobile no
hay lugar para una franja permanente: ahí queda un botón chico y el panel ocupa
la pantalla completa — pero es **el mismo panel**, no otro. La primera versión
tenía dos (uno `lg:hidden` y otro `hidden lg:flex`) y eso son dos instancias del
chat: dos conversaciones distintas, y al cambiar el tamaño de la ventana se
perdía el hilo. Lo encontró un test que cuenta cuántos campos de texto hay.

### Reportar un problema

El asistente ya derivaba las incidencias a soporte con un mail. Eso pone la carga
en el usuario: abrir el correo, acordarse de en qué pantalla estaba, describirlo
otra vez. La mitad de los reportes se pierde ahí.

Ahora, cuando una respuesta cae en la ruta `soporte`, aparece **"Reportar este
problema"**: abre un formulario de dos campos —uno solo obligatorio— **ya cargado
con lo que la persona escribió**. La pantalla, el rol, la concesionaria, el
navegador y el hilo de la conversación los adjunta el servidor. Se guarda en
`assistant_reports` y recién después se intenta el mail: si Resend falla, el
reporte ya está a salvo.

Los reportes aparecen en `/super-admin/kb`, arriba de los huecos. Son dos cosas
distintas a propósito: un hueco es documentación que falta, un reporte es algo
roto. Se resuelven distinto y los mira gente distinta.

### Cuatro desviaciones del plan, y por qué

**1. `misNumeros` no reusa `lib/reports/loaders.ts`.** El plan decía que sí. Esos
loaders traen hasta 5.000 filas para armar un reporte completo y se comerían
enteros los 50–200 ms de presupuesto por herramienta (§10). La herramienta hace
nueve `count(*)` estrechos y, cuando el usuario quiere el panorama completo,
devuelve el **link al reporte** en vez de un párrafo. Seguir la letra de esa
celda habría roto la letra del presupuesto de latencia.

**2. No se reusa `validateAnswer` del bot del inbox.** Sí se reusan
`sanitizeInbound` y `detectInjection`. Pero la validación de salida del bot
bloquea importes, porcentajes y links, y acá "tenés 12 leads sin contactar" y
"tu conversión es 8 %" son exactamente lo que se pidió. `assistant/output.ts`
tiene el filtro que sí corresponde a este modelo de amenaza: instrucciones
filtradas, links externos y mails ajenos. La diferencia está documentada en el
encabezado de ese archivo.

**3. Se extrajo el menú a `src/lib/nav.ts`.** Estaba embebido en
`app-sidebar.tsx`, un componente cliente, y por eso nadie más lo podía leer. Sin
esto, §5.b ("el conocimiento de navegación se genera desde el código") era
imposible. El sidebar ahora lo consume y resuelve el nombre del ícono; es el
mismo patrón que `reports/registry.ts`.

**4. La cápsula se partió en dos archivos.** `capsule.ts` (puro) y `context.ts`
(el IO). Lo forzó el primer test: importar la cápsula arrastraba el cliente de
Supabase y con él la validación de variables de entorno. Es la misma separación
que ya existía entre `bot/decide.ts` y `bot/respond.ts`, y ahora la cápsula se
testea sin infraestructura.

### Tres bugs que encontraron los tests

Vale la pena dejarlos anotados porque los tres eran errores de diseño, no typos:

1. **El troceador perdía encabezados.** La primera versión arrastraba las
   secciones cortas a la siguiente para no dejar fragmentos chiquitos, y el
   contenido terminaba guardado bajo el encabezado equivocado — peor que ser
   corto, porque la ruta es justamente lo que se antepone antes de embeber. Ahora
   cada sección es su propio fragmento y sólo se pega lo verdaderamente diminuto
   (< 60 caracteres), con su encabezado adentro del texto.

2. **`dondeEsta` no encontraba nada con preguntas cortas.** "¿Dónde configuro el
   bot?" deja un solo token útil después de sacar las palabras vacías, y el
   umbral pedía dos coincidencias. El umbral ahora se adapta al largo de la
   pregunta.

3. **El explicador de permisos miraba la entidad y no el verbo.** "¿Por qué no
   puedo **aprobar** una venta?" y "¿por qué no **veo** una venta?" mencionan lo
   mismo y son dos permisos distintos. Ahora manda el verbo
   (`intendedCapability` en `router.ts`) y la entidad desempata.

### Cuatro bugs más que aparecieron al probarlo contra la base real

Los tres primeros no se veían en los tests puros. Es la diferencia entre "los
tests pasan" y "funciona".

4. **El umbral de "no sé" estaba en 0,25 y se colaban 8 de 10** preguntas fuera
   de alcance. Medido y corregido a 0,50 (§6). Es el bug más importante de los
   cuatro: era exactamente el modo de falla que este diseño existe para evitar.

5. **Las respuestas se cortaban a mitad de frase.** El tope de tokens de la
   generación (420) y el tope de caracteres del validador (1.400) estaban
   desalineados: una respuesta de cinco pasos llegaba al límite de tokens justo
   antes del punto final. Ahora uno se deriva del otro.

6. **"¿Dónde está la facturación?" derivaba a soporte** en vez de dar la ruta.
   La regla de plata de la plataforma corría antes que la de navegación, y
   "dónde está X" es intención de navegación sea cual sea X. Se reordenó: la
   navegación va primera.

7. **`kb-sync` no arrancaba.** Los imports se hoistean por encima de
   `loadEnvConfig`, así que el cliente de Supabase se cargaba —y validaba el
   entorno— antes de que existiera. Las dependencias con entorno pasaron a
   importarse de forma diferida.

### Qué falta para cerrar

- Cargar los secretos del workflow de CI (`OPENAI_API_KEY` y los de Supabase).
- Volver a correr `pnpm kb:calibrate` cuando el corpus crezca: el margen entre
  relevante e irrelevante es de 0,013 y el conjunto de calibración es chico.
- Cachear la cápsula por sesión: son nueve consultas por pregunta y es la
  próxima palanca de latencia (§10).

---

## 17. Lo que este diseño decide NO hacer

- **No** meter datos de leads/ventas en el vector store. §1.
- **No** usar el cliente service-role en las herramientas. §7.
- **No** un agente con SQL libre: catálogo cerrado de ocho funciones.
- **No** acciones de escritura en v1.
- **No** hablar de facturación ni de precios de la plataforma: deriva.
- **No** un prompt gigante, ni siquiera "por ahora". §2.
- **No** conocimiento copiado a mano desde el código. §5.b.

---

## 18. Lo que hay que definir

1. **¿Sólo empleados del CRM, o también un asistente para el cliente final?**
   Este diseño asume empleados. El del cliente final es el bot del inbox, que ya
   existe y tiene otro modelo de amenaza — no conviene mezclarlos.
2. **¿El SuperAdmin puede leer conversaciones?** Ayuda muchísimo al soporte y es
   incómodo en privacidad. Propuesta: métricas agregadas siempre; el hilo
   completo sólo si el usuario aprieta "reportar esta respuesta".
3. **¿La base de conocimiento es igual para todas las concesionarias?** Hoy sí
   (es producto). Si mañana una quiere cargar sus propios procedimientos, la
   tabla ya lo soporta con un `company_id` nullable; conviene no construirlo
   hasta que lo pidan.
4. **Nombre y tono.** El bot del inbox habla como la concesionaria. Este habla
   como el CRM. ¿Tiene nombre propio o es "Asistente"?
5. **¿Entra en el plan Estándar o es un adicional?** Cambia si el `min_plan` de
   los artículos tiene que hacer algo o es decorativo.

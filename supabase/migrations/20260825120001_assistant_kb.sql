-- ============================================================================
-- Asistente IA del CRM — base de conocimiento, conversaciones y mejora continua.
--
-- Ver `docs/asistente-ia.md`. Resumen de las decisiones que explican este schema:
--
--  · Los EMBEDDINGS son sólo para CONOCIMIENTO DE PRODUCTO (kb_*). Los datos de
--    la concesionaria (leads, ventas, usuarios) NO entran nunca a un índice
--    vectorial: la similitud coseno no sabe de `company_id`, y ya tenemos RLS
--    que resuelve el aislamiento bien. Las preguntas sobre datos se contestan
--    con consultas, no con recuperación.
--
--  · `kb_articles` / `kb_chunks` NO son datos de tenant: son la documentación
--    del producto, igual para todas las concesionarias. Los lee cualquier
--    usuario autenticado; el filtro por rol/plan/feature lo pone la consulta
--    (`match_kb`), no la policy.
--
--  · `assistant_threads` / `assistant_messages` SÍ son sensibles (pueden citar
--    datos del usuario): RLS por dueño, sin excepción ni para el super_admin.
--
--  · `assistant_gaps` y `assistant_cache` no tienen policies para `authenticated`
--    a propósito: los escribe y los lee el servidor con service-role. Que un
--    usuario no pueda escribir en la caché directamente es lo que evita
--    envenenarla.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Conocimiento
-- ---------------------------------------------------------------------------

-- De dónde salió el artículo. Define quién lo puede editar y si se pisa en cada
-- reindexado.
create type public.kb_source as enum (
  'repo',      -- markdown de docs/ — se regenera desde el archivo
  'generado',  -- derivado del código (menú, reportes, enums, permisos)
  'manual'     -- lo escribió una persona desde /super-admin/kb
);

create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  -- Una línea. Es lo que se muestra como cita debajo de la respuesta.
  summary text,
  body_md text not null,
  source public.kb_source not null,
  -- Archivo del repo que lo originó. null para los manuales.
  source_path text,
  -- Para qué roles es relevante. null = todos.
  -- OJO: es "para quién es relevante", no "quién tiene permiso". Un vendedor SÍ
  -- puede leer que las ventas las aprueba el gerente; lo que no le sirve es el
  -- paso a paso de una pantalla que no puede abrir.
  audience_roles public.user_role[],
  -- Si está seteado, sólo se muestra a empresas en ese plan. Hoy ningún artículo
  -- lo usa (ver §17.5 del doc): la decisión comercial no está tomada.
  min_plan public.company_plan,
  -- Módulo del que habla ('inbox', 'bot', 'cotizador', 'sheets', 'ads'…). Si la
  -- empresa no lo tiene activo, no se explica cómo usarlo.
  feature text,
  -- Ruta de la app con la que se relaciona. Sube de ranking si el usuario está
  -- parado ahí cuando pregunta.
  route_prefix text,
  -- Términos que tienen que matchear sí o sí. Mismo patrón que bot_intents:
  -- cuando algo se recupera mal se arregla con un dato, no con un deploy.
  keywords text[] not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kb_articles_source_idx on public.kb_articles (source);
create index kb_articles_feature_idx on public.kb_articles (feature) where feature is not null;

create trigger kb_articles_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  -- Orden dentro del artículo. Sirve para reconstruirlo y para el unique.
  ord integer not null,
  -- "Sistema y reglas › Asignación automática › Pool de candidatos".
  -- Se antepone al contenido ANTES de embeber: sin esto un fragmento corto
  -- ("Empate → al azar") no se parece a ninguna pregunta. Con esto, sí.
  heading_path text not null default '',
  content text not null,
  tokens integer not null default 0,
  -- sha256 de (heading_path + content). El reindexado incremental compara esto
  -- y sólo re-embebe lo que cambió.
  content_hash text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  -- Columna generada: el índice de texto tiene que matchear exactamente la
  -- expresión de la consulta, y una generada garantiza que no se desincronicen.
  fts tsvector generated always as (
    to_tsvector('spanish', coalesce(heading_path, '') || ' ' || content)
  ) stored,
  unique (article_id, ord)
);

create index kb_chunks_article_idx on public.kb_chunks (article_id);
create index kb_chunks_hash_idx on public.kb_chunks (content_hash);
create index kb_chunks_fts_idx on public.kb_chunks using gin (fts);
create index kb_chunks_trgm_idx on public.kb_chunks using gin (content gin_trgm_ops);

-- HNSW sobre distancia coseno. Con unos miles de fragmentos un scan lineal
-- alcanzaría; el índice es barato de mantener y deja la puerta abierta a crecer.
create index kb_chunks_embedding_idx
  on public.kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 2. Conversaciones
-- ---------------------------------------------------------------------------

create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_threads_user_idx
  on public.assistant_threads (user_id, created_at desc);

create trigger assistant_threads_updated_at
  before update on public.assistant_threads
  for each row execute function public.set_updated_at();

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Ruta que eligió el ruteador: producto | datos | permisos | navegacion |
  -- soporte | fuera_de_alcance. Se guarda para poder medir la mezcla real.
  route text,
  -- Fragmentos que se usaron para responder. Es lo que hace la respuesta
  -- auditable: "¿de dónde sacó eso?" tiene respuesta.
  chunk_ids uuid[] not null default '{}',
  tool_calls jsonb not null default '[]',
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  -- 1 = 👍, -1 = 👎, null = sin opinión.
  feedback smallint check (feedback in (-1, 1)),
  feedback_note text,
  created_at timestamptz not null default now()
);

create index assistant_messages_thread_idx
  on public.assistant_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Mejora continua
-- ---------------------------------------------------------------------------

create type public.assistant_gap_status as enum (
  'abierto',
  'respondido',
  'descartado'
);

-- Preguntas que el asistente no supo contestar, o cuya respuesta recibió 👎.
-- Se guarda la PREGUNTA, nunca la respuesta ni datos del lead: es material para
-- escribir documentación, no un registro de la operación.
create table public.assistant_gaps (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  embedding vector(1536),
  -- Con qué rol y plan se preguntó. Sirve para priorizar: 12 vendedores
  -- preguntando lo mismo pesa más que un admin.
  role public.user_role,
  company_id uuid references public.companies(id) on delete set null,
  -- Preguntas parecidas se agrupan bajo el id de la primera del grupo.
  cluster_id uuid,
  hits integer not null default 1,
  status public.assistant_gap_status not null default 'abierto',
  resolved_article_id uuid references public.kb_articles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_gaps_status_idx on public.assistant_gaps (status, hits desc);
create index assistant_gaps_cluster_idx on public.assistant_gaps (cluster_id);
create index assistant_gaps_embedding_idx
  on public.assistant_gaps
  using hnsw (embedding vector_cosine_ops);

create trigger assistant_gaps_updated_at
  before update on public.assistant_gaps
  for each row execute function public.set_updated_at();

-- Caché semántica. Sólo guarda respuestas de la ruta "producto": conocimiento
-- del CRM, igual para todos los que comparten `scope_key`. Nunca respuestas con
-- datos de la concesionaria — eso sería una fuga entre usuarios.
create table public.assistant_cache (
  id uuid primary key default gen_random_uuid(),
  -- rol + plan + módulos activos. Dos usuarios con distinto scope no comparten
  -- respuesta aunque hagan la misma pregunta: la respuesta correcta difiere.
  scope_key text not null,
  question text not null,
  embedding vector(1536) not null,
  answer text not null,
  sources jsonb not null default '[]',
  -- Artículos citados. Si alguno cambia, la entrada se invalida.
  article_ids uuid[] not null default '{}',
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index assistant_cache_scope_idx on public.assistant_cache (scope_key);
create index assistant_cache_articles_idx on public.assistant_cache using gin (article_ids);
create index assistant_cache_embedding_idx
  on public.assistant_cache
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.kb_articles enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_gaps enable row level security;
alter table public.assistant_cache enable row level security;

-- Conocimiento: lo lee cualquier autenticado (es documentación de producto, no
-- dato de nadie). Lo escribe sólo el super_admin — y el service-role del
-- reindexado, que saltea RLS por definición.
create policy "kb_articles_select_authenticated"
  on public.kb_articles for select
  to authenticated
  using (true);

create policy "kb_articles_write_super_admin"
  on public.kb_articles for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "kb_chunks_select_authenticated"
  on public.kb_chunks for select
  to authenticated
  using (true);

create policy "kb_chunks_write_super_admin"
  on public.kb_chunks for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Conversaciones: sólo el dueño. Ni el admin de la concesionaria ni el
-- super_admin las leen desde acá; el soporte se hace con las métricas agregadas
-- y con los hilos que el usuario reporta explícitamente.
create policy "assistant_threads_own"
  on public.assistant_threads for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "assistant_messages_own"
  on public.assistant_messages for all
  to authenticated
  using (
    exists (
      select 1 from public.assistant_threads t
      where t.id = assistant_messages.thread_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.assistant_threads t
      where t.id = assistant_messages.thread_id
        and t.user_id = (select auth.uid())
    )
  );

-- assistant_gaps y assistant_cache: SIN policies para authenticated.
-- RLS activa + cero policies = nadie entra por PostgREST. Sólo el servidor con
-- service-role. Es deliberado, no un olvido.

-- ---------------------------------------------------------------------------
-- 5. Búsqueda híbrida
-- ---------------------------------------------------------------------------

-- ¿El plan de la empresa cubre un artículo marcado con `min_plan`?
-- Hoy es casi inerte porque ningún artículo setea `min_plan` (ver §17.5 del
-- doc). Existe para que el día que se decida, el lugar donde tocar sea uno solo.
create or replace function public.kb_plan_covers(
  p_plan public.company_plan,
  p_min_plan public.company_plan
)
returns boolean
language sql
immutable
as $$
  select
    p_min_plan is null                -- el artículo no exige plan
    or p_plan is null                 -- no sabemos el plan: no escondemos nada
    or p_plan = p_min_plan
    or p_plan = 'personalizado'       -- acuerdo particular: incluye todo
$$;

-- Búsqueda híbrida: vector + texto, fusionados por rango recíproco (RRF).
--
-- Por qué las dos y no sólo vectores: "gerencia", "pool sin clasificar",
-- "reingreso", "ACARA" son términos exactos del dominio. El embedding los
-- aproxima; el índice de texto los clava. En castellano con jerga propia, sólo
-- vectorial se equivoca seguido.
--
-- `security invoker` (el default) es a propósito: así la RLS del que llama sigue
-- aplicando adentro. Una `security definer` acá sería exactamente el agujero que
-- el diseño evita.
create or replace function public.match_kb(
  query_embedding vector(1536),
  query_text text,
  p_role public.user_role,
  p_plan public.company_plan default null,
  p_features text[] default '{}',
  p_route text default null,
  match_count integer default 5,
  candidate_count integer default 12,
  per_article integer default 2
)
returns table (
  chunk_id uuid,
  article_id uuid,
  slug text,
  title text,
  summary text,
  heading_path text,
  content text,
  score real,
  -- Similitud coseno con la consulta (0..1). El RRF sirve para ORDENAR, no para
  -- decidir si algo es relevante: siempre da un número. El umbral de "no sé" se
  -- evalúa sobre esta columna.
  similarity real,
  vector_rank integer,
  text_rank integer
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with filtered as (
    select
      c.id, c.article_id, c.heading_path, c.content, c.embedding, c.fts,
      a.slug, a.title, a.summary, a.route_prefix
    from public.kb_chunks c
    join public.kb_articles a on a.id = c.article_id
    where (a.audience_roles is null or p_role = any (a.audience_roles))
      and public.kb_plan_covers(p_plan, a.min_plan)
      and (a.feature is null or a.feature = any (p_features))
  ),
  vec as (
    select f.id, row_number() over (order by f.embedding <=> query_embedding) as rnk
    from filtered f
    where query_embedding is not null and f.embedding is not null
    order by f.embedding <=> query_embedding
    limit candidate_count
  ),
  txt as (
    select
      f.id,
      row_number() over (
        order by ts_rank(f.fts, websearch_to_tsquery('spanish', query_text)) desc
      ) as rnk
    from filtered f
    where coalesce(query_text, '') <> ''
      and f.fts @@ websearch_to_tsquery('spanish', query_text)
    -- El `order by` acá NO es decorativo: sin él, el `limit` corta filas
    -- arbitrarias antes de que el ranking las ordene y el motor de texto
    -- devuelve cualquier cosa.
    order by ts_rank(f.fts, websearch_to_tsquery('spanish', query_text)) desc
    limit candidate_count
  ),
  -- RRF: 1/(k + rango). k=60 es el valor clásico; amortigua el peso de los
  -- primeros puestos para que un solo motor no domine la fusión.
  fused as (
    select
      coalesce(v.id, t.id) as id,
      (1.0 / (60 + coalesce(v.rnk, 1000)))::real
        + (1.0 / (60 + coalesce(t.rnk, 1000)))::real as rrf,
      v.rnk::integer as vrank,
      t.rnk::integer as trank
    from vec v
    full outer join txt t on t.id = v.id
  ),
  scored as (
    select
      f.id, f.article_id, f.slug, f.title, f.summary, f.heading_path, f.content,
      -- Empujón si el usuario está parado en la pantalla de la que habla el
      -- artículo. Es contexto gratis y sube mucho la precisión.
      (fu.rrf + case
        when f.route_prefix is not null
             and coalesce(p_route, '') like f.route_prefix || '%'
        then 0.004
        else 0
      end)::real as score,
      (case
        when query_embedding is null or f.embedding is null then 0
        else 1 - (f.embedding <=> query_embedding)
      end)::real as similarity,
      fu.vrank, fu.trank,
      row_number() over (
        partition by f.article_id
        order by fu.rrf desc
      ) as per_article_rank
    from fused fu
    join filtered f on f.id = fu.id
  )
  select
    s.id, s.article_id, s.slug, s.title, s.summary, s.heading_path, s.content,
    s.score, s.similarity, s.vrank, s.trank
  from scored s
  where s.per_article_rank <= per_article
  order by s.score desc
  limit match_count
$$;

-- Caché semántica. La llama el servidor con service-role, por eso puede ser
-- `security definer`: la tabla no tiene policies y no contiene datos de tenant.
create or replace function public.match_assistant_cache(
  query_embedding vector(1536),
  p_scope_key text,
  min_similarity real default 0.95
)
returns table (id uuid, answer text, sources jsonb, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.answer,
    c.sources,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.assistant_cache c
  where c.scope_key = p_scope_key
    and c.expires_at > now()
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit 1
$$;

revoke all on function public.match_assistant_cache(vector, text, real) from public, anon, authenticated;
-- `revoke ... from public` también le saca el permiso a service_role: sin este
-- grant, el servidor no puede llamar a su propia función.
grant execute on function public.match_assistant_cache(vector, text, real) to service_role;

-- Incremento atómico del contador de uso de la caché. PostgREST no sabe hacer
-- `hits = hits + 1`, y un update leído-y-escrito desde la app perdería cuentas.
create or replace function public.bump_assistant_cache_hit(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.assistant_cache set hits = hits + 1 where id = p_id
$$;

revoke all on function public.bump_assistant_cache_hit(uuid) from public, anon, authenticated;
grant execute on function public.bump_assistant_cache_hit(uuid) to service_role;

-- Preguntas sin respuesta parecidas a una dada, para agrupar en clusters.
create or replace function public.match_assistant_gaps(
  query_embedding vector(1536),
  min_similarity real default 0.88
)
returns table (id uuid, cluster_id uuid, question text, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    g.id,
    g.cluster_id,
    g.question,
    (1 - (g.embedding <=> query_embedding))::real as similarity
  from public.assistant_gaps g
  where g.embedding is not null
    and g.status = 'abierto'
    and (1 - (g.embedding <=> query_embedding)) >= min_similarity
  order by g.embedding <=> query_embedding
  limit 1
$$;

revoke all on function public.match_assistant_gaps(vector, real) from public, anon, authenticated;
grant execute on function public.match_assistant_gaps(vector, real) to service_role;

create or replace function public.bump_assistant_gap_hit(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.assistant_gaps
     set hits = hits + 1, updated_at = now()
   where id = p_id
$$;

revoke all on function public.bump_assistant_gap_hit(uuid) from public, anon, authenticated;
grant execute on function public.bump_assistant_gap_hit(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Auditoría de RLS
--
-- La matriz de permisos de `src/lib/permissions.ts` DESCRIBE la RLS, no la
-- reemplaza. Esto le da a `pnpm test:permissions` una forma de verificar que lo
-- que dice la matriz existe de verdad en la base. Sólo super_admin.
-- ---------------------------------------------------------------------------
create or replace function public.rls_audit()
returns table (
  table_name text,
  rls_enabled boolean,
  policy_name text,
  command text,
  roles text[]
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    c.relname::text as table_name,
    c.relrowsecurity as rls_enabled,
    p.polname::text as policy_name,
    case p.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      else 'ALL'
    end as command,
    coalesce(
      (select array_agg(r.rolname::text) from pg_roles r where r.oid = any (p.polroles)),
      array['public']
    ) as roles
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
    and public.is_super_admin()
  order by c.relname, p.polname
$$;

revoke all on function public.rls_audit() from public, anon;
grant execute on function public.rls_audit() to authenticated;

comment on table public.kb_articles is
  'Base de conocimiento del asistente. Documentación de PRODUCTO, no dato de tenant. Ver docs/asistente-ia.md.';
comment on table public.assistant_cache is
  'Caché semántica. SÓLO respuestas de la ruta "producto" — nunca respuestas con datos de la concesionaria.';

-- ============================================================================
-- `match_kb`: orden estable.
--
-- La versión anterior ordenaba sólo por `score`. Con empates —frecuentes, porque
-- el RRF produce valores discretos— Postgres devolvía las filas en el orden que
-- le convenía y el corte de `match_count` variaba entre corridas idénticas. El
-- golden set de recuperación daba 100 % una vez y 95 % la siguiente sin que
-- cambiara ni el corpus ni la pregunta.
--
-- Sólo cambia el ORDER BY. El resto de la función es igual.
-- ============================================================================

set search_path = public, extensions;

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
  -- Desempate EXPLÍCITO. Sin él, dos fragmentos con el mismo score salían en el
  -- orden que quisiera Postgres y el corte de top-5 cambiaba entre corridas: el
  -- golden set daba 100 % una vez y 95 % la siguiente, sin que cambiara nada.
  -- Un test que titila deja de mirarse.
  order by s.score desc, s.similarity desc, s.id
  limit match_count
$$;

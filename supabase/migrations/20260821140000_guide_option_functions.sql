-- ============================================================================
-- Opciones del cotizador resueltas en la base.
--
-- El bug: listar las marcas con `select brand from used_price_guide` devolvía 3.
-- La guía tiene 14.815 filas y PostgREST corta en 1000, así que el DISTINCT en
-- el cliente sólo veía las primeras marcas del alfabeto. Lo mismo con los
-- modelos de una marca grande (Fiat sola tiene 1.006 filas).
--
-- Es el mismo tope que ya nos había mordido en la pantalla de leads. La forma
-- correcta es que el DISTINCT lo haga Postgres y devuelva sólo el resultado.
--
-- SECURITY INVOKER (el default): las funciones respetan la RLS de
-- `used_price_guide`, que ya permite lectura a cualquier usuario autenticado.
-- ============================================================================

-- Guía vigente: el mes más reciente sincronizado.
create or replace function public.guide_latest_as_of()
returns date
language sql
stable
set search_path = public
as $$
  select max(as_of) from public.used_price_guide where source = 'acara'
$$;

create or replace function public.guide_brands()
returns setof text
language sql
stable
set search_path = public
as $$
  select distinct brand
  from public.used_price_guide
  where source = 'acara'
    and as_of = public.guide_latest_as_of()
  order by brand
$$;

create or replace function public.guide_models(p_brand text)
returns setof text
language sql
stable
set search_path = public
as $$
  select distinct model
  from public.used_price_guide
  where source = 'acara'
    and as_of = public.guide_latest_as_of()
    and brand = p_brand
  order by model
$$;

create or replace function public.guide_versions(p_brand text, p_model text)
returns setof text
language sql
stable
set search_path = public
as $$
  select distinct version
  from public.used_price_guide
  where source = 'acara'
    and as_of = public.guide_latest_as_of()
    and brand = p_brand
    and model = p_model
  order by version
$$;

-- Años con precio, del más nuevo al más viejo. Excluye el 0km (year null).
create or replace function public.guide_years(
  p_brand text,
  p_model text,
  p_version text
)
returns setof smallint
language sql
stable
set search_path = public
as $$
  select distinct year
  from public.used_price_guide
  where source = 'acara'
    and as_of = public.guide_latest_as_of()
    and brand = p_brand
    and model = p_model
    and version = p_version
    and year is not null
  order by year desc
$$;

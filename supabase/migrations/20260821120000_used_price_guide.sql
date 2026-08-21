-- ============================================================================
-- Guía de precios de usados (ACARA).
--
-- La releva mensualmente la Comisión de Valuación de Vehículos Usados de ACARA,
-- integrada por concesionarios reales: no son precios de publicación como los de
-- un portal, es el consenso de los que compran y venden. Y los valores rigen
-- para Capital y GBA, que es exactamente la plaza del piloto.
--
-- Uso autorizado por ACARA (gestionado por el cliente, socio de la entidad).
-- Ver docs/cotizador-usados.md.
--
-- ----------------------------------------------------------------------------
-- DECISIONES
-- ----------------------------------------------------------------------------
-- · La clave es el ID de ACARA, no el nombre. Matchear "208 Feline" contra
--   "1.6 Feline Tiptronic" por texto es la forma garantizada de cotizar mal
--   algunos casos y no enterarse nunca. `version_id` es la clave real.
--
-- · Cada sincronización guarda su propio `as_of`, no pisa el mes anterior. Sirve
--   para dos cosas: una cotización vieja se puede reproducir tal como se hizo
--   ("¿por qué le ofrecimos eso en agosto?"), y se puede ver la evolución de un
--   modelo mes a mes.
--
-- · `year is null` = unidad 0km. La guía trae la columna 0km al lado de los años
--   y conviene guardarla: es el techo contra el que se compara un usado.
--
-- · La moneda viene POR FILA (hay vehículos cotizados en dólares). Guardarla mal
--   no da un número raro, da un número mil veces equivocado.
--
-- · Es data de referencia, no de un tenant: una sola copia para todas las
--   concesionarias. Lectura para cualquier usuario autenticado, escritura sólo
--   service_role (la escribe el sync).
-- ============================================================================

create table public.used_price_guide (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'acara',
  -- 1 = autos (el resto de los tipos de ACARA: 2 motos, 3 camiones, 4 agrícola).
  vehicle_type smallint not null default 1,

  -- Identidad según la fuente. Los ids son la clave; los nombres son para mostrar.
  brand_id int not null,
  brand text not null,
  model_id int not null,
  model text not null,
  version_id int not null,
  version text not null,

  -- null = 0km.
  year smallint check (year is null or year between 1980 and 2100),
  currency char(3) not null check (currency in ('ARS', 'USD')),
  value numeric(14, 2) not null check (value > 0),

  -- Mes de la guía con la que se sincronizó. La guía no trae fecha propia, así
  -- que es la fecha de la sincronización: es un proxy, y como tal se muestra.
  as_of date not null,
  created_at timestamptz not null default now(),

  unique (source, version_id, year, as_of)
);

-- Búsqueda del cotizador: marca → modelo → versión → año.
create index used_price_guide_lookup_idx
  on public.used_price_guide (source, brand, model, year);
create index used_price_guide_version_idx
  on public.used_price_guide (version_id, as_of desc);
-- Para resolver "la guía más reciente" sin escanear todo.
create index used_price_guide_asof_idx
  on public.used_price_guide (source, as_of desc);

comment on table public.used_price_guide is
  'Guía de precios de usados por marca/modelo/versión/año. Una fila por valor y '
  'por mes de guía: los meses anteriores no se pisan.';

alter table public.used_price_guide enable row level security;

-- Data de referencia: la lee cualquier usuario logueado de cualquier
-- concesionaria. No tiene company_id porque no es de nadie en particular.
create policy "used_price_guide_select"
  on public.used_price_guide for select to authenticated
  using (true);

-- Sin policies de escritura: la única vía es el service_role del sync.

-- ----------------------------------------------------------------------------
-- Log de sincronizaciones: para saber si el precio que estamos mostrando es de
-- este mes o de hace tres, sin tener que deducirlo de los datos.
-- ----------------------------------------------------------------------------
create table public.used_price_syncs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'acara',
  as_of date not null,
  brands_ok int not null default 0,
  brands_failed int not null default 0,
  rows_upserted int not null default 0,
  duration_ms int,
  error text,
  created_at timestamptz not null default now()
);

alter table public.used_price_syncs enable row level security;

create policy "used_price_syncs_select"
  on public.used_price_syncs for select to authenticated
  using (true);

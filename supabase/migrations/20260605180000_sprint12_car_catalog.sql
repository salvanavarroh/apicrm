-- Sprint 12 — Catálogo de marcas y modelos de autos.
-- Fuente principal: DNRPA (Argentina, oficial, mensual). Fallback: dataset
-- global open-source (MIT). Permite agregar entradas manuales por admin.
--
-- Lectura: cualquier usuario autenticado de cualquier empresa (es un catálogo
-- compartido — todos cargan leads y necesitan elegir modelo). Escritura: solo
-- super_admin (la actualización se hace vía script/cron).

create extension if not exists pg_trgm;

create table public.car_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null,        -- "Volkswagen", "Fiat", etc — title case
  model text not null,        -- "Amarok", "Cronos", "208" — primer "modelo" sin trims
  source text not null default 'dnrpa' check (source in ('dnrpa','global','manual')),
  origin text,                -- 'NACIONAL' | 'IMPORTADO' | null (DNRPA only)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dedup case-insensitive.
  unique (brand, model)
);

create trigger car_catalog_set_updated_at
  before update on public.car_catalog
  for each row execute function public.set_updated_at();

-- Índice trgm para fuzzy search por marca + modelo combinados.
create index car_catalog_brand_trgm_idx
  on public.car_catalog using gin (brand gin_trgm_ops);
create index car_catalog_model_trgm_idx
  on public.car_catalog using gin (model gin_trgm_ops);
create index car_catalog_brand_lower_idx on public.car_catalog (lower(brand));

alter table public.car_catalog enable row level security;

-- Lectura para cualquier authenticated (catálogo compartido).
create policy "car_catalog_select_authenticated"
  on public.car_catalog for select to authenticated
  using (true);

-- Escritura/upsert solo SuperAdmin (lo hace el script de seed/cron).
create policy "car_catalog_super_admin_write"
  on public.car_catalog for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- Entrada de leads desde Google Sheets (bloque B de la reunión).
--
-- El caso concreto: TikTok Lead Gen escribe automáticamente en una planilla a
-- medida que entran leads. En vez de pelear con la API de cada plataforma,
-- polleamos la planilla cada X minutos y creamos los leads en el CRM.
--
-- Modo PULL a propósito: el cron es nuestro. Con push (un Apps Script del lado
-- del cliente) cualquiera que toque la planilla rompe la integración y nos
-- enteramos cuando alguien reclama que no llegan leads.
--
-- Idempotencia: `sheet_synced_rows` guarda el hash de cada fila ya importada.
-- Así una fila insertada en el medio (no al final) tampoco se duplica, que es lo
-- que rompería un simple "última fila procesada".
-- ============================================================================

create table public.sheet_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  name text not null check (length(trim(name)) > 0),
  -- ID de la planilla y gid de la hoja (los dos salen de la URL de Google).
  spreadsheet_id text not null,
  gid text not null default '0',

  -- Mapeo de columnas: { "phone": "Teléfono", "first_name": "Nombre", ... }.
  -- La clave es el campo del lead; el valor, el encabezado en la planilla.
  column_map jsonb not null default '{}',

  -- Valores por default para los leads que entren por esta fuente.
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,

  active boolean not null default false,
  -- Cada cuánto pollear. TikTok escribe de a poco, así que 15 min es un buen
  -- default: no golpea a Google y no deja al lead frío.
  poll_minutes int not null default 15 check (poll_minutes between 5 and 1440),

  last_synced_at timestamptz,
  last_result text,
  last_error text,
  total_imported int not null default 0,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, spreadsheet_id, gid)
);

create trigger sheet_sources_set_updated_at
  before update on public.sheet_sources
  for each row execute function public.set_updated_at();

create index sheet_sources_company_idx on public.sheet_sources (company_id);
-- Para que el cron levante sólo las que toca sincronizar.
create index sheet_sources_due_idx
  on public.sheet_sources (active, last_synced_at)
  where active;

-- ----------------------------------------------------------------------------
-- Huella de cada fila ya importada. Es lo que hace el sync idempotente.
-- ----------------------------------------------------------------------------
create table public.sheet_synced_rows (
  source_id uuid not null references public.sheet_sources(id) on delete cascade,
  row_hash text not null,
  lead_id uuid references public.leads(id) on delete set null,
  imported_at timestamptz not null default now(),
  primary key (source_id, row_hash)
);

alter table public.sheet_sources enable row level security;
alter table public.sheet_synced_rows enable row level security;

-- Lectura para la empresa; escritura sólo admin (es configuración).
create policy "sheet_sources_select" on public.sheet_sources
  for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "sheet_sources_write" on public.sheet_sources
  for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_role()) = 'admin'
  );

create policy "sheet_synced_rows_select" on public.sheet_synced_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.sheet_sources s
      where s.id = source_id
        and s.company_id = (select public.current_company_id())
    )
  );

comment on table public.sheet_sources is
  'Planillas de Google que se pollean para crear leads. Caso principal: la hoja '
  'que llena TikTok Lead Gen automáticamente.';
comment on table public.sheet_synced_rows is
  'Hash de cada fila ya importada. Hace el sync idempotente incluso si se '
  'insertan filas en el medio de la planilla.';
comment on column public.sheet_sources.poll_minutes is
  'Cada cuánto pollea el cron. Default 15 min.';

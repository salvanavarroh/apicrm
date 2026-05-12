-- Sprint 2 — sucursales, tipos de producto, campañas (PRD §6.5 §6.6 §6.7)

-- ============================================================================
-- Enums
-- ============================================================================

create type public.branch_status as enum ('active', 'inactive');
create type public.product_type_status as enum ('active', 'inactive');
create type public.campaign_status as enum ('active', 'inactive');
create type public.campaign_origin as enum (
  'meta_ads',
  'google_ads',
  'whatsapp',
  'showroom',
  'referral',
  'web',
  'email',
  'other'
);

-- ============================================================================
-- branches (PRD §6.6)
-- Sucursales de la empresa. ABM por Admin. Si hay 1 sola queda preseleccionada
-- en otros formularios.
-- ============================================================================

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  status public.branch_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

create index branches_company_id_idx on public.branches (company_id);
create index branches_status_idx on public.branches (status);

alter table public.branches enable row level security;

-- ============================================================================
-- product_types (PRD §6.5)
-- Tipos de Producto por empresa (ej: 0km, usados, planes).
-- Cada tipo se habilita en N sucursales (tabla branch_product_types).
-- ============================================================================

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status public.product_type_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create trigger product_types_set_updated_at
  before update on public.product_types
  for each row execute function public.set_updated_at();

create index product_types_company_id_idx on public.product_types (company_id);

alter table public.product_types enable row level security;

-- ============================================================================
-- branch_product_types (M:N — qué tipos están habilitados en qué sucursal)
-- ============================================================================

create table public.branch_product_types (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_type_id uuid not null
    references public.product_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (branch_id, product_type_id)
);

create index branch_product_types_branch_idx
  on public.branch_product_types (branch_id);
create index branch_product_types_product_type_idx
  on public.branch_product_types (product_type_id);

alter table public.branch_product_types enable row level security;

-- ============================================================================
-- campaigns (PRD §6.7)
-- ABM con origen + tipo de producto y sucursal opcionales.
-- ============================================================================

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  origin public.campaign_origin not null,
  product_type_id uuid references public.product_types(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  status public.campaign_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create index campaigns_company_id_idx on public.campaigns (company_id);
create index campaigns_status_idx on public.campaigns (status);

alter table public.campaigns enable row level security;

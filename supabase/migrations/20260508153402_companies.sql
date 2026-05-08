-- Sprint 1 — tabla companies (PRD §6.2 + §7)
-- Cuenta principal del SaaS. Tenant root: toda tabla operativa va a referenciar
-- company_id y filtrar por RLS.

create table public.companies (
  id uuid primary key default gen_random_uuid(),

  -- Datos comerciales (operativos, editables por Admin)
  name text not null,
  logo_url text,
  phone text,
  address text,

  -- Datos legales (solo editables por SuperAdmin — PRD §4 regla dura)
  legal_name text,
  cuit text,

  -- Facturación interna (PRD §6.3)
  monthly_price numeric(12, 2),
  subscription_ends_at date,

  status public.company_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Búsqueda por nombre desde el panel SuperAdmin (cantidad de empresas en piloto
-- es chica, índice trgm es overkill — alcanza con btree para sort/filter).
create index companies_status_idx on public.companies (status);
create index companies_name_idx on public.companies (lower(name));

-- RLS habilitado, sin policies todavía (van en 20260508153404_rls_policies.sql).
-- Sin policies + RLS on = nadie ve nada salvo service_role. Es el default seguro.
alter table public.companies enable row level security;

comment on table public.companies is
  'Cuentas/concesionarios del SaaS. Tenant root.';
comment on column public.companies.legal_name is
  'Razón social. Solo editable por SuperAdmin (PRD §4).';
comment on column public.companies.cuit is
  'CUIT. Solo editable por SuperAdmin (PRD §4).';

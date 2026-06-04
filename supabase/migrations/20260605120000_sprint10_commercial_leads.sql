-- Sprint 10 — Pipeline comercial del SaaS (leads que llegan desde la landing
-- pública de marketing pidiendo demo). Independiente del pipeline de leads
-- por dealer (tabla `leads`).
--
-- Solo el SuperAdmin tiene acceso. Inserts públicos van por la API endpoint
-- /api/commercial-leads/submit usando service_role (bypass RLS).

create type public.commercial_lead_status as enum (
  'new',            -- Recién llegado
  'contacted',      -- Ya contactamos
  'demo_scheduled', -- Demo agendada
  'demo_done',      -- Demo realizada
  'won',            -- Convertido a cliente
  'lost'            -- Perdido / no avanzó
);

-- ============================================================================
-- commercial_leads
-- ============================================================================

create table public.commercial_leads (
  id uuid primary key default gen_random_uuid(),

  -- Datos del contacto (form de landing)
  first_name text not null,
  last_name text,
  email text not null,
  company_name text,
  phone text,
  team_size text,     -- "1-5 vendedores" / "6-15 vendedores" / etc.
  message text,

  -- Pipeline interno
  status public.commercial_lead_status not null default 'new',
  assigned_to uuid references public.profiles(id) on delete set null,

  -- Tracking del origen
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_url text,
  referrer text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger commercial_leads_set_updated_at
  before update on public.commercial_leads
  for each row execute function public.set_updated_at();

create index commercial_leads_status_idx on public.commercial_leads (status);
create index commercial_leads_created_idx
  on public.commercial_leads (created_at desc);
create index commercial_leads_email_idx on public.commercial_leads (lower(email));

alter table public.commercial_leads enable row level security;

-- SuperAdmin: lectura + escritura completa.
create policy "commercial_leads_super_admin_all"
  on public.commercial_leads for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- commercial_lead_notes
-- ============================================================================

create table public.commercial_lead_notes (
  id uuid primary key default gen_random_uuid(),
  commercial_lead_id uuid not null
    references public.commercial_leads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now()
);

create index commercial_lead_notes_lead_idx
  on public.commercial_lead_notes (commercial_lead_id);

alter table public.commercial_lead_notes enable row level security;

create policy "commercial_lead_notes_super_admin_all"
  on public.commercial_lead_notes for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

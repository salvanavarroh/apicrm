-- ============================================================================
-- Import histórico de leads de un formulario de Meta Lead Ads. Job reanudable:
-- guarda el cursor de paginación y el estado, para poder continuar si se corta.
-- ============================================================================

create table if not exists public.lead_ad_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meta_form_id text not null,
  status text not null default 'running', -- running | paused | done | error
  imported integer not null default 0,
  duplicates integer not null default 0,
  cursor text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meta_form_id)
);

create trigger lead_ad_imports_set_updated_at
  before update on public.lead_ad_imports
  for each row execute function public.set_updated_at();

alter table public.lead_ad_imports enable row level security;

-- Lectura: admin/manager/supervisor de la empresa. Escrituras por service-role.
drop policy if exists lead_ad_imports_select on public.lead_ad_imports;
create policy lead_ad_imports_select on public.lead_ad_imports
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      company_id = (select public.current_company_id())
      and (select public.current_role()) = any (
        array['admin','manager','supervisor']::public.user_role[]
      )
    )
  );

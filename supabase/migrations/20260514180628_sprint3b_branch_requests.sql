-- Sprint 3b — ajustes pedidos por cliente:
-- 1) Fecha de alta + vencimiento auto +30d en companies
-- 2) Flujo "Solicitar sucursal" (Admin solicita, SuperAdmin aprueba)
-- 3) Seed automático de tipos de producto al crear empresa

-- ============================================================================
-- 1) Companies: agregar subscription_starts_at + default vencimiento +30d
-- ============================================================================

alter table public.companies
  add column subscription_starts_at date default current_date;

create or replace function public.companies_default_subscription_ends_at()
returns trigger
language plpgsql
as $$
begin
  if new.subscription_starts_at is null then
    new.subscription_starts_at := current_date;
  end if;
  if new.subscription_ends_at is null then
    new.subscription_ends_at := new.subscription_starts_at + interval '30 days';
  end if;
  return new;
end;
$$;

create trigger companies_default_subs_dates
  before insert or update on public.companies
  for each row execute function public.companies_default_subscription_ends_at();

-- Backfill empresas existentes
update public.companies
set subscription_starts_at = created_at::date
where subscription_starts_at is null;

update public.companies
set subscription_ends_at = subscription_starts_at + interval '30 days'
where subscription_ends_at is null;

-- ============================================================================
-- 2) branch_requests
-- ============================================================================

create type public.branch_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'canceled'
);

create table public.branch_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,

  name text not null,
  address text,
  city text,
  phone text,
  notes text,

  status public.branch_request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_branch_id uuid references public.branches(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger branch_requests_set_updated_at
  before update on public.branch_requests
  for each row execute function public.set_updated_at();

create index branch_requests_company_idx
  on public.branch_requests (company_id);
create index branch_requests_status_idx
  on public.branch_requests (status);

alter table public.branch_requests enable row level security;

create policy "br_select_super_admin"
  on public.branch_requests for select to authenticated
  using (public.is_super_admin());

create policy "br_select_same_company"
  on public.branch_requests for select to authenticated
  using (company_id = public.current_company_id());

create policy "br_insert_admin"
  on public.branch_requests for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "br_update_super_admin"
  on public.branch_requests for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "br_update_admin_cancel"
  on public.branch_requests for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
    and status = 'pending'
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
    and status in ('pending', 'canceled')
  );

-- ============================================================================
-- 3) Seed automático de tipos de producto al crear empresa
-- ============================================================================

create or replace function public.seed_default_product_types()
returns trigger
language plpgsql
as $$
begin
  insert into public.product_types (company_id, name, status)
  values
    (new.id, 'Usados', 'active'),
    (new.id, 'Plan de ahorro', 'active'),
    (new.id, 'Ventas especiales', 'active'),
    (new.id, 'Convencional', 'active'),
    (new.id, 'Todos', 'active')
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;

create trigger companies_seed_product_types
  after insert on public.companies
  for each row execute function public.seed_default_product_types();

-- Backfill para empresas existentes
insert into public.product_types (company_id, name, status)
select c.id, t.name, 'active'::public.product_type_status
from public.companies c
cross join (
  values ('Usados'), ('Plan de ahorro'), ('Ventas especiales'),
         ('Convencional'), ('Todos')
) as t(name)
on conflict (company_id, name) do nothing;

-- Quitar la policy de Admin que permite borrar product_types (ahora son
-- gestionados por seed; Admin solo puede toggle status, no eliminar).
-- Si querés permitirlo, basta con dejar el delete policy como antes.
-- (Mantenemos delete por compatibilidad con UI actual.)

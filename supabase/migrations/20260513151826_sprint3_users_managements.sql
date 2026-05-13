-- Sprint 3 — ABM completo de usuarios + Gerencia + toggle asignación auto
-- PRD §3, §6.8, §6.11

-- ============================================================================
-- Profiles: agregar columnas para Gerente y Vendedor (PRD §7)
-- ============================================================================

alter table public.profiles
  add column branch_id uuid references public.branches(id) on delete set null,
  add column manager_id uuid references public.profiles(id) on delete set null,
  add column commission_percent numeric(5, 2),
  add column commission_conditions text;

create index profiles_branch_id_idx on public.profiles (branch_id);
create index profiles_manager_id_idx on public.profiles (manager_id);

-- ============================================================================
-- user_product_types (M:N entre profiles y product_types)
-- Gerente: tipos que maneja. Vendedor: tipos asignados (subset del Gerente).
-- ============================================================================

create table public.user_product_types (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_type_id uuid not null
    references public.product_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_type_id)
);

create index user_product_types_user_idx
  on public.user_product_types (user_id);
create index user_product_types_pt_idx
  on public.user_product_types (product_type_id);

alter table public.user_product_types enable row level security;

-- ============================================================================
-- managements (Gerencia = sucursal + tipo de producto + gerente)
-- PRD §3. Una combinación (branch, product_type) tiene UN gerente.
-- PRD §6.11: toggle "asignación automática" vive acá.
-- ============================================================================

create table public.managements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_type_id uuid not null
    references public.product_types(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete restrict,
  auto_assignment_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_type_id)
);

create trigger managements_set_updated_at
  before update on public.managements
  for each row execute function public.set_updated_at();

create index managements_company_idx on public.managements (company_id);
create index managements_manager_idx on public.managements (manager_id);

alter table public.managements enable row level security;

-- ============================================================================
-- RLS
-- ============================================================================

-- user_product_types: scoped vía profile.
create policy "upt_select_super_admin"
  on public.user_product_types for select to authenticated
  using (public.is_super_admin());

create policy "upt_select_same_company"
  on public.user_product_types for select to authenticated
  using (
    exists(
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = public.current_company_id()
    )
  );

-- Insert/Update/Delete: solo Admin (gestiona Gerentes/Proveedores) o Manager
-- (gestiona Vendedores) de la misma empresa.
create policy "upt_write_admin_manager"
  on public.user_product_types for all to authenticated
  using (
    public.current_role() in ('admin', 'manager')
    and exists(
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = public.current_company_id()
    )
  )
  with check (
    public.current_role() in ('admin', 'manager')
    and exists(
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = public.current_company_id()
    )
  );

-- managements
create policy "managements_select_super_admin"
  on public.managements for select to authenticated
  using (public.is_super_admin());

create policy "managements_select_same_company"
  on public.managements for select to authenticated
  using (company_id = public.current_company_id());

create policy "managements_insert_admin"
  on public.managements for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "managements_update_admin"
  on public.managements for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Manager puede togglear auto_assignment_enabled de sus propias gerencias.
create policy "managements_update_manager_own"
  on public.managements for update to authenticated
  using (
    public.current_role() = 'manager'
    and manager_id = auth.uid()
  )
  with check (
    public.current_role() = 'manager'
    and manager_id = auth.uid()
  );

create policy "managements_delete_admin"
  on public.managements for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- Profiles policies update: Admin puede crear/editar Gerentes/Proveedores;
-- Manager puede crear Vendedores. INSERT igual va vía trigger handle_new_auth_user
-- (que viene del invite) — no necesitamos policy de INSERT para profiles.
-- ============================================================================

-- Manager puede editar Vendedores de su empresa (para asignar comisión / tipos).
create policy "profiles_update_manager_same_company"
  on public.profiles for update to authenticated
  using (
    public.current_role() = 'manager'
    and company_id is not null
    and company_id = public.current_company_id()
    and role = 'sales'
  )
  with check (
    public.current_role() = 'manager'
    and company_id is not null
    and company_id = public.current_company_id()
    and role = 'sales'
  );

-- Helper: tipos de producto del Gerente actual (para el form del Vendedor).
create or replace function public.current_user_product_type_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select product_type_id
  from public.user_product_types
  where user_id = auth.uid()
$$;

-- Sprint 4 — Captura de leads (PRD §6.10, §7)
-- Tablas: leads + lead_submissions
-- RLS: Admin (toda la empresa), Manager (sus gerencias), Sales (sus leads),
--      Provider (sus cargas en estado 'new').

-- ============================================================================
-- Enums
-- ============================================================================

create type public.lead_status as enum (
  'new',
  'contacted',
  'interested',
  'quoted',
  'not_interested'
);

create type public.lead_payment_method as enum (
  'cash',
  'financed',
  'savings_plan',
  'used_car',
  'other'
);

-- ============================================================================
-- leads
-- ============================================================================

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Cliente
  first_name text,
  last_name text,
  email text,
  phone text,
  city text,

  -- Vehículo
  vehicle_model text,
  vehicle_version text,
  preferred_color text,

  -- Comercial
  budget_min numeric(14, 2),
  budget_max numeric(14, 2),
  has_used_car boolean not null default false,
  used_car_description text,
  declared_payment_method lead_payment_method,

  -- Routing
  campaign_id uuid references public.campaigns(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  product_type_id uuid references public.product_types(id) on delete set null,

  -- Asignación
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,

  -- Estado
  status lead_status not null default 'new',
  status_changed_at timestamptz not null default now(),

  -- Notas iniciales (notas y tareas formales: sprint 5)
  initial_notes text,

  -- Trazabilidad
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_has_some_contact check (
    phone is not null or email is not null
  )
);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create index leads_company_idx on public.leads (company_id);
create index leads_assigned_idx on public.leads (assigned_user_id);
create index leads_branch_pt_idx on public.leads (branch_id, product_type_id);
create index leads_status_idx on public.leads (status);
create index leads_phone_idx on public.leads (phone);
create index leads_email_idx on public.leads (email);
create index leads_created_by_idx on public.leads (created_by);

alter table public.leads enable row level security;

-- Update status_changed_at cuando cambia el status.
create or replace function public.leads_status_timestamp()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

create trigger leads_status_timestamp_trg
  before update on public.leads
  for each row execute function public.leads_status_timestamp();

-- ============================================================================
-- lead_submissions: histórico cuando entra una nueva carga con mismo tel/email
-- ============================================================================

create table public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  data_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index lead_submissions_lead_idx on public.lead_submissions (lead_id);
create index lead_submissions_company_idx
  on public.lead_submissions (company_id);

alter table public.lead_submissions enable row level security;

-- ============================================================================
-- RLS — leads
-- ============================================================================

-- SuperAdmin (soporte): lectura.
create policy "leads_select_super_admin"
  on public.leads for select to authenticated
  using (public.is_super_admin());

-- Admin: lee todos los leads de su empresa.
create policy "leads_select_admin"
  on public.leads for select to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Manager: lee leads de sus gerencias (branch+product_type match).
create policy "leads_select_manager"
  on public.leads for select to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  );

-- Sales: lee los leads que tiene asignados.
create policy "leads_select_sales"
  on public.leads for select to authenticated
  using (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and assigned_user_id = auth.uid()
  );

-- Provider: lee sus cargas.
create policy "leads_select_provider"
  on public.leads for select to authenticated
  using (
    public.current_role() = 'data_provider'
    and company_id = public.current_company_id()
    and created_by = auth.uid()
  );

-- INSERT
create policy "leads_insert_admin"
  on public.leads for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "leads_insert_manager"
  on public.leads for insert to authenticated
  with check (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
  );

create policy "leads_insert_provider"
  on public.leads for insert to authenticated
  with check (
    public.current_role() = 'data_provider'
    and company_id = public.current_company_id()
  );

-- UPDATE
create policy "leads_update_admin"
  on public.leads for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Manager: leads de sus gerencias.
create policy "leads_update_manager"
  on public.leads for update to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  )
  with check (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
  );

-- Sales: sus leads asignados.
create policy "leads_update_sales"
  on public.leads for update to authenticated
  using (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and assigned_user_id = auth.uid()
  )
  with check (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and assigned_user_id = auth.uid()
  );

-- Provider: sus cargas en estado 'new' (interpretación de "≤Asignado").
create policy "leads_update_provider"
  on public.leads for update to authenticated
  using (
    public.current_role() = 'data_provider'
    and company_id = public.current_company_id()
    and created_by = auth.uid()
    and status = 'new'
  )
  with check (
    public.current_role() = 'data_provider'
    and company_id = public.current_company_id()
    and created_by = auth.uid()
  );

-- DELETE: solo Admin.
create policy "leads_delete_admin"
  on public.leads for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- RLS — lead_submissions
-- ============================================================================

create policy "submissions_select_super_admin"
  on public.lead_submissions for select to authenticated
  using (public.is_super_admin());

create policy "submissions_select_same_company"
  on public.lead_submissions for select to authenticated
  using (company_id = public.current_company_id());

create policy "submissions_insert_same_company"
  on public.lead_submissions for insert to authenticated
  with check (company_id = public.current_company_id());

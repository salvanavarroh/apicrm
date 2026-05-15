-- Sprint 7 — Ventas + validación con triple check (PRD §6.15, §5)
-- Tabla sales con estados (evaluating, accepted, rejected) y snapshot de comisión.

create type public.sale_status as enum ('evaluating', 'accepted', 'rejected');

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  vendor_id uuid references public.profiles(id) on delete set null,

  status sale_status not null default 'evaluating',

  -- Snapshot del precio al iniciar
  final_price numeric(14, 2) not null check (final_price >= 0),

  -- Triple check del Admin
  scoring_check boolean,
  scoring_comment text,
  documentation_check boolean,
  documentation_comment text,
  payment_check boolean,
  payment_comment text,

  general_comment text,
  rejection_reason text,

  -- Commission snapshot
  commission_percent_snapshot numeric(5, 2),

  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

create index sales_company_idx on public.sales (company_id);
create index sales_lead_idx on public.sales (lead_id);
create index sales_vendor_idx on public.sales (vendor_id);
create index sales_status_idx on public.sales (status);

alter table public.sales enable row level security;

-- RLS
create policy "sales_select_super_admin"
  on public.sales for select to authenticated
  using (public.is_super_admin());

create policy "sales_select_admin"
  on public.sales for select to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "sales_select_manager"
  on public.sales for select to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id
       and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id and m.manager_id = auth.uid()
    )
  );

create policy "sales_select_sales"
  on public.sales for select to authenticated
  using (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
  );

-- Insert: solo Sales sobre sus propios leads.
create policy "sales_insert_sales"
  on public.sales for insert to authenticated
  with check (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
    and exists (
      select 1 from public.leads l
      where l.id = sales.lead_id
        and l.assigned_user_id = auth.uid()
        and l.status = 'quoted'
    )
  );

-- Update: solo Admin (validación).
create policy "sales_update_admin"
  on public.sales for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Sprint 6 — Lista de Precios + Presupuestos (PRD §6.9, §6.14)
-- Tablas: prices (lista referencial) + quotes (presupuestos generados)
-- Storage bucket: "quotes" para PDFs.

-- ============================================================================
-- prices — lista referencial por empresa. Vendedor cotiza con precios manuales,
-- esto es solo guía.
-- ============================================================================

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_type_id uuid references public.product_types(id) on delete set null,
  brand text not null,
  model text not null,
  version text,
  model_year text,
  currency text not null default 'ARS',
  list_price numeric(14, 2) not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prices_set_updated_at
  before update on public.prices
  for each row execute function public.set_updated_at();

create index prices_company_idx on public.prices (company_id);
create index prices_product_type_idx on public.prices (product_type_id);
create index prices_brand_model_idx on public.prices (brand, model);

alter table public.prices enable row level security;

-- RLS
create policy "prices_select_super_admin"
  on public.prices for select to authenticated
  using (public.is_super_admin());

create policy "prices_select_same_company"
  on public.prices for select to authenticated
  using (company_id = public.current_company_id());

create policy "prices_insert_admin"
  on public.prices for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "prices_update_admin"
  on public.prices for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "prices_delete_admin"
  on public.prices for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- quotes
-- ============================================================================

create type public.quote_modality as enum ('cash', 'financed', 'savings_plan');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  vendor_id uuid references public.profiles(id) on delete set null,
  modality quote_modality not null,

  -- Snapshot del cliente (editable al cotizar, ej. comprador distinto)
  client_first_name text,
  client_last_name text,
  client_email text,
  client_phone text,
  client_dni text,

  -- Snapshot del vehículo
  vehicle_brand text,
  vehicle_model text,
  vehicle_version text,
  vehicle_year text,
  vehicle_color text,

  -- Aritmética común
  base_price numeric(14, 2) not null check (base_price >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  used_car_value numeric(14, 2) not null default 0 check (used_car_value >= 0),
  total numeric(14, 2) not null check (total >= 0),

  -- Atributos por modalidad (financed: anticipo, cuotas, TNA, CFT, etc;
  -- savings_plan: nombre del plan, cuotas totales, etc).
  modality_data jsonb not null default '{}'::jsonb,

  -- Validez y notas
  valid_until date,
  notes text,

  -- Persistencia
  pdf_url text,
  pdf_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

create index quotes_company_idx on public.quotes (company_id);
create index quotes_lead_idx on public.quotes (lead_id);
create index quotes_vendor_idx on public.quotes (vendor_id);

alter table public.quotes enable row level security;

-- RLS quotes
create policy "quotes_select_super_admin"
  on public.quotes for select to authenticated
  using (public.is_super_admin());

create policy "quotes_select_admin"
  on public.quotes for select to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "quotes_select_manager"
  on public.quotes for select to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id
       and m.product_type_id = l.product_type_id
      where l.id = quotes.lead_id and m.manager_id = auth.uid()
    )
  );

create policy "quotes_select_sales"
  on public.quotes for select to authenticated
  using (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
  );

create policy "quotes_insert_sales"
  on public.quotes for insert to authenticated
  with check (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
    and exists (
      select 1 from public.leads l
      where l.id = quotes.lead_id
        and l.assigned_user_id = auth.uid()
    )
  );

create policy "quotes_update_sales"
  on public.quotes for update to authenticated
  using (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
  )
  with check (
    public.current_role() = 'sales'
    and company_id = public.current_company_id()
    and vendor_id = auth.uid()
  );

-- ============================================================================
-- Storage bucket: "quotes" (privado, signed URLs por sesión)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', false)
on conflict (id) do nothing;

-- Solo authenticated puede leer/escribir, scoped por path = company_id/...
-- El path típico será {company_id}/{quote_id}.pdf
create policy "quotes_storage_select_same_company"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'quotes'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy "quotes_storage_insert_same_company"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "quotes_storage_update_same_company"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

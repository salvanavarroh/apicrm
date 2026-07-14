-- ============================================================================
-- Sprint: aprobación de ventas por el gerente, documentación de ventas,
-- notificaciones, link compartible de cotización y config de presupuesto.
-- Todas las funciones de RLS van envueltas en (select ...) por rendimiento.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Notificaciones (campanita + contadores por sección en el menú).
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- destinatario
  category text not null,      -- 'sales' | 'leads' | 'tasks' | 'other' (= sección del menú)
  type text not null,          -- 'sale_submitted' | 'sale_approved' | 'sale_rejected' | 'lead_assigned' | ...
  title text not null,
  body text,
  link text,                   -- href a dónde navegar al tocarla
  entity_type text,            -- 'sale' | 'lead'
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- El usuario ve y marca como leídas SUS notificaciones. El insert lo hace el
-- server (admin client) al disparar eventos.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, category)
  where read_at is null;
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2) Historial de revisiones de venta (aprobaciones/rechazos/reenvíos).
-- ----------------------------------------------------------------------------
create table if not exists public.sale_reviews (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null,         -- 'approved' | 'rejected' | 'resubmitted'
  reason text,                  -- motivo de rechazo
  scoring_check boolean,
  payment_check boolean,
  documentation_check boolean,
  general_comment text,
  reviewer_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.sale_reviews enable row level security;

-- Visible para quien ve la venta (delega en la RLS de sales). Insert = server.
drop policy if exists sale_reviews_select on public.sale_reviews;
create policy sale_reviews_select on public.sale_reviews
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_reviews.sale_id));

create index if not exists sale_reviews_sale_idx
  on public.sale_reviews (sale_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3) Documentación de la venta (archivos: DNI + adjuntos con título).
-- ----------------------------------------------------------------------------
create table if not exists public.sale_documents (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'other',  -- 'dni' | 'other'
  title text not null,
  file_path text not null,
  mime_type text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.sale_documents enable row level security;

-- Ve/gestiona quien ve la venta (delega en la RLS de sales).
drop policy if exists sale_documents_select on public.sale_documents;
create policy sale_documents_select on public.sale_documents
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_documents.sale_id));

drop policy if exists sale_documents_insert on public.sale_documents;
create policy sale_documents_insert on public.sale_documents
  for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and exists (select 1 from public.sales s where s.id = sale_documents.sale_id)
  );

drop policy if exists sale_documents_delete on public.sale_documents;
create policy sale_documents_delete on public.sale_documents
  for delete to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_documents.sale_id));

create index if not exists sale_documents_sale_idx
  on public.sale_documents (sale_id, created_at desc);

-- Bucket privado para los archivos de la venta. Path = {company_id}/{sale_id}/{uuid}.
insert into storage.buckets (id, name, public)
values ('sale-docs', 'sale-docs', false)
on conflict (id) do nothing;

drop policy if exists sale_docs_select_same_company on storage.objects;
create policy sale_docs_select_same_company on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sale-docs'
    and (
      (select public.is_super_admin())
      or (storage.foldername(name))[1] = (select public.current_company_id())::text
    )
  );

drop policy if exists sale_docs_insert_same_company on storage.objects;
create policy sale_docs_insert_same_company on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sale-docs'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );

drop policy if exists sale_docs_delete_same_company on storage.objects;
create policy sale_docs_delete_same_company on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sale-docs'
    and (storage.foldername(name))[1] = (select public.current_company_id())::text
  );

-- ----------------------------------------------------------------------------
-- 4) Aprobación de ventas por el GERENTE / SUPERVISOR (además del admin).
--    El vendedor NO puede actualizar la venta por RLS: el re-envío se hace por
--    una server action con el admin client (valida que sea su venta rechazada).
-- ----------------------------------------------------------------------------
drop policy if exists sales_update_manager on public.sales;
create policy sales_update_manager on public.sales
  for update to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id and m.manager_id = (select auth.uid())
    )
  )
  with check (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists sales_update_supervisor on public.sales;
create policy sales_update_supervisor on public.sales
  for update to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id
        and m.manager_id = (select public.acting_manager_id())
    )
  )
  with check (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
  );

-- ----------------------------------------------------------------------------
-- 5) Link compartible de cotización + config de presupuesto en la empresa.
-- ----------------------------------------------------------------------------
alter table public.quotes
  add column if not exists share_token text;
create unique index if not exists quotes_share_token_key
  on public.quotes (share_token)
  where share_token is not null;

alter table public.companies
  add column if not exists quote_legal_text text;

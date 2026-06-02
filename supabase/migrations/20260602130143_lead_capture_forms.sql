-- Lead capture forms: Admin/Gerente arman forms públicos embebibles.
-- Submissions entran como leads del routing fijo del form (branch + product_type + campaign).

create table public.lead_capture_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Routing fijo: el lead entrante hereda estos valores.
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_type_id uuid not null references public.product_types(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete set null,

  created_by uuid references public.profiles(id) on delete set null,

  -- Identidad del form en el CRM (no se muestra al público).
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),

  -- Contenido visible (landing + embed).
  title text not null default 'Dejanos tus datos',
  subtitle text,
  submit_label text not null default 'Enviar',
  success_message text not null default '¡Gracias! Te vamos a contactar a la brevedad.',

  -- Branding (logo y banner son URLs públicas del bucket form-assets).
  logo_url text,
  banner_url text,
  primary_color text not null default '#FF5906',

  -- Config de campos: labels custom + cuáles son obligatorios.
  fields jsonb not null default '{
    "first_name":     {"label": "Nombre",                "placeholder": "Tu nombre",            "required": true},
    "last_name":      {"label": "Apellido",              "placeholder": "Tu apellido",          "required": false},
    "phone":          {"label": "Teléfono",              "placeholder": "+54 11 1234 5678",     "required": true},
    "email":          {"label": "Email",                 "placeholder": "tu@email.com",         "required": false},
    "city":           {"label": "Ciudad",                "placeholder": "Buenos Aires",         "required": false},
    "vehicle_model":  {"label": "Vehículo de interés",   "placeholder": "Ej: Civic Hybrid",     "required": false},
    "initial_notes":  {"label": "Notas",                 "placeholder": "Contanos más",         "required": false}
  }'::jsonb,

  submissions_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint forms_routing_belongs_to_company check (branch_id is not null and product_type_id is not null)
);

create trigger lead_capture_forms_set_updated_at
  before update on public.lead_capture_forms
  for each row execute function public.set_updated_at();

create index lead_capture_forms_company_idx
  on public.lead_capture_forms (company_id);
create index lead_capture_forms_branch_pt_idx
  on public.lead_capture_forms (branch_id, product_type_id);
create index lead_capture_forms_created_by_idx
  on public.lead_capture_forms (created_by);

alter table public.lead_capture_forms enable row level security;

-- ============================================================================
-- RLS
-- ============================================================================

-- SuperAdmin lee todo (soporte).
create policy "forms_select_super_admin"
  on public.lead_capture_forms for select to authenticated
  using (public.is_super_admin());

-- Admin: lee/crea/edita/borra forms de su empresa.
create policy "forms_select_admin"
  on public.lead_capture_forms for select to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "forms_insert_admin"
  on public.lead_capture_forms for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "forms_update_admin"
  on public.lead_capture_forms for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "forms_delete_admin"
  on public.lead_capture_forms for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Manager: lee/crea/edita/borra SOLO sobre sus gerencias.
create policy "forms_select_manager"
  on public.lead_capture_forms for select to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_insert_manager"
  on public.lead_capture_forms for insert to authenticated
  with check (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_update_manager"
  on public.lead_capture_forms for update to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  )
  with check (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_delete_manager"
  on public.lead_capture_forms for delete to authenticated
  using (
    public.current_role() = 'manager'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = auth.uid()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

-- Lectura pública (anon): solo forms activos para renderizar landing/embed.
create policy "forms_select_public_active"
  on public.lead_capture_forms for select to anon
  using (status = 'active');

-- ============================================================================
-- Storage bucket: form-assets (logos + banners). Público para leer.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('form-assets', 'form-assets', true)
on conflict (id) do nothing;

-- Lectura pública.
create policy "form_assets_select_public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'form-assets');

-- Upload: solo authenticated dentro de su company_id (path = {company_id}/...).
create policy "form_assets_insert_same_company"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "form_assets_update_same_company"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy "form_assets_delete_same_company"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- ============================================================================
-- Fase 0 — Cimientos de mensajería omnicanal (Zernio).
--   * companies.country (ISO-2): región por defecto de normalización.
--   * leads.phone_e164 (canónico, indexado) + leads.merged_into_id.
--   * webhook_events: dedup/idempotencia de webhooks entrantes (service-role).
--   * lead_merges: auditoría de unificaciones.
--   * duplicate_lead_groups(): detección de duplicados por (empresa, phone_e164).
--   * merge_leads(): unificación transaccional (mueve satélites al superviviente).
-- Ver docs/mensajeria-zernio-arquitectura.md §3, §6.11.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) companies.country — ISO-2 (AR, UY, MX, CL, CO, PE, ...).
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists country text;

comment on column public.companies.country is
  'ISO-2 del país de la empresa. Región por defecto para normalizar teléfonos locales a E.164.';

-- ----------------------------------------------------------------------------
-- 2) leads.phone_e164 + merged_into_id.
-- ----------------------------------------------------------------------------
alter table public.leads
  add column if not exists phone_e164 text,
  add column if not exists merged_into_id uuid references public.leads(id) on delete set null;

create index if not exists leads_company_phone_e164_idx
  on public.leads (company_id, phone_e164)
  where phone_e164 is not null;

create index if not exists leads_merged_into_idx
  on public.leads (merged_into_id)
  where merged_into_id is not null;

comment on column public.leads.phone_e164 is
  'Teléfono canónico E.164 (multi-país). Fuente de verdad para dedup/reingreso.';
comment on column public.leads.merged_into_id is
  'Si el lead fue absorbido por una unificación (§6.11), apunta al superviviente.';

-- ----------------------------------------------------------------------------
-- 3) webhook_events — idempotencia at-least-once de webhooks entrantes.
--    Solo service-role (server) escribe/lee. RLS on, sin policies = denegado.
-- ----------------------------------------------------------------------------
create table if not exists public.webhook_events (
  event_id text primary key,             -- payload.id / header X-Zernio-Event-Id
  provider text not null default 'zernio',
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received', -- received | processed | failed | skipped
  attempts int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists webhook_events_status_idx
  on public.webhook_events (status)
  where status in ('received', 'failed');

alter table public.webhook_events enable row level security;

-- ----------------------------------------------------------------------------
-- 4) lead_merges — auditoría de unificaciones.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_merges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  survivor_id uuid not null references public.leads(id) on delete cascade,
  absorbed_ids uuid[] not null,
  performed_by uuid references public.profiles(id) on delete set null,
  detail jsonb not null default '{}',    -- { moved: {tabla: n, ...}, reason }
  created_at timestamptz not null default now()
);
create index if not exists lead_merges_company_idx
  on public.lead_merges (company_id, created_at desc);

alter table public.lead_merges enable row level security;

-- Admin/SuperAdmin ven la auditoría de su empresa. Insert = RPC (security definer).
drop policy if exists lead_merges_select on public.lead_merges;
create policy lead_merges_select on public.lead_merges
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.current_role()) = 'admin'::user_role
      and company_id = (select public.current_company_id())
    )
  );

-- ----------------------------------------------------------------------------
-- 5) duplicate_lead_groups() — grupos de leads activos con el mismo phone_e164
--    en la empresa del usuario. Excluye archivados y ya-unificados.
-- ----------------------------------------------------------------------------
create or replace function public.duplicate_lead_groups()
returns table (phone_e164 text, lead_ids uuid[], lead_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.phone_e164,
    array_agg(l.id order by l.created_at) as lead_ids,
    count(*) as lead_count
  from public.leads l
  where l.company_id = public.current_company_id()
    and l.phone_e164 is not null
    and l.merged_into_id is null
    and l.archived_at is null
  group by l.phone_e164
  having count(*) > 1
  order by count(*) desc, l.phone_e164
$$;

-- ----------------------------------------------------------------------------
-- 6) merge_leads() — unificación transaccional.
--    Mueve TODOS los satélites al superviviente, consolida campos nulos,
--    archiva los absorbidos (archived_at + merged_into_id) y audita.
--    Autorización: admin/manager de la empresa (o super_admin).
-- ----------------------------------------------------------------------------
create or replace function public.merge_leads(
  p_survivor uuid,
  p_absorbed uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role := public.current_role();
  v_company uuid := public.current_company_id();
  v_super boolean := public.is_super_admin();
  v_survivor_company uuid;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
  v_bad int;
begin
  if not (v_super or v_role in ('admin', 'manager')) then
    raise exception 'No autorizado para unificar leads' using errcode = '42501';
  end if;

  if p_absorbed is null or array_length(p_absorbed, 1) is null then
    raise exception 'No hay leads para absorber';
  end if;
  if p_survivor = any(p_absorbed) then
    raise exception 'El superviviente no puede estar en la lista de absorbidos';
  end if;

  -- Superviviente válido y de la empresa del usuario (salvo super_admin).
  select company_id into v_survivor_company
  from public.leads where id = p_survivor;
  if v_survivor_company is null then
    raise exception 'Lead superviviente inexistente';
  end if;
  if not v_super and v_survivor_company <> v_company then
    raise exception 'El lead no pertenece a tu empresa' using errcode = '42501';
  end if;

  -- Todos los absorbidos deben existir, ser de la MISMA empresa y no estar ya unificados.
  select count(*) into v_bad
  from unnest(p_absorbed) as a(id)
  left join public.leads l on l.id = a.id
  where l.id is null
     or l.company_id <> v_survivor_company
     or l.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'Algún lead a absorber es inválido, de otra empresa o ya unificado';
  end if;

  -- Mover satélites al superviviente.
  update public.lead_notes       set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('lead_notes', v_n);
  update public.lead_tasks       set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('lead_tasks', v_n);
  update public.visits           set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('visits', v_n);
  update public.quotes           set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('quotes', v_n);
  update public.sales            set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('sales', v_n);
  update public.lead_submissions set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('lead_submissions', v_n);
  update public.lead_vehicles    set lead_id = p_survivor where lead_id = any(p_absorbed);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('lead_vehicles', v_n);

  -- Consolidar campos nulos del superviviente con el valor más reciente de los absorbidos.
  update public.leads s set
    first_name  = coalesce(s.first_name,  a.first_name),
    last_name   = coalesce(s.last_name,   a.last_name),
    email       = coalesce(s.email,       a.email),
    phone       = coalesce(s.phone,       a.phone),
    phone_e164  = coalesce(s.phone_e164,  a.phone_e164),
    city        = coalesce(s.city,        a.city),
    national_id = coalesce(s.national_id, a.national_id),
    vehicle_brand   = coalesce(s.vehicle_brand,   a.vehicle_brand),
    vehicle_model   = coalesce(s.vehicle_model,   a.vehicle_model),
    vehicle_version = coalesce(s.vehicle_version, a.vehicle_version)
  from (
    select
      (array_agg(first_name      order by created_at desc) filter (where first_name      is not null))[1] as first_name,
      (array_agg(last_name       order by created_at desc) filter (where last_name       is not null))[1] as last_name,
      (array_agg(email           order by created_at desc) filter (where email           is not null))[1] as email,
      (array_agg(phone           order by created_at desc) filter (where phone           is not null))[1] as phone,
      (array_agg(phone_e164      order by created_at desc) filter (where phone_e164       is not null))[1] as phone_e164,
      (array_agg(city            order by created_at desc) filter (where city            is not null))[1] as city,
      (array_agg(national_id     order by created_at desc) filter (where national_id     is not null))[1] as national_id,
      (array_agg(vehicle_brand   order by created_at desc) filter (where vehicle_brand   is not null))[1] as vehicle_brand,
      (array_agg(vehicle_model   order by created_at desc) filter (where vehicle_model   is not null))[1] as vehicle_model,
      (array_agg(vehicle_version order by created_at desc) filter (where vehicle_version is not null))[1] as vehicle_version
    from public.leads
    where id = any(p_absorbed)
  ) a
  where s.id = p_survivor;

  -- Archivar los absorbidos + apuntar al superviviente.
  update public.leads
    set merged_into_id = p_survivor,
        archived_at = coalesce(archived_at, now())
  where id = any(p_absorbed);

  -- Auditoría.
  insert into public.lead_merges (company_id, survivor_id, absorbed_ids, performed_by, detail)
  values (
    v_survivor_company, p_survivor, p_absorbed, auth.uid(),
    jsonb_build_object('moved', v_moved, 'reason', p_reason)
  );

  return jsonb_build_object('survivor', p_survivor, 'absorbed', to_jsonb(p_absorbed), 'moved', v_moved);
end;
$$;

-- La autorización se enforce DENTRO de la función (chequeo de rol/empresa).
-- Sólo bloqueamos anon; authenticated conserva execute para llamarla vía PostgREST.
revoke all on function public.merge_leads(uuid, uuid[], text) from anon;

-- Sprint 13 — Cambios de producto (pedido Salvador):
--   1) Multi-gerente: varias gerencias pueden compartir (sucursal, producto).
--   2) Multi-consulta: varios autos/consultas por lead (quotes/ventas siguen en el lead).
--   3) last_contacted_at: última vez que se contactó al cliente.
--   4) Re-asignación: round-robin "pool" entre todos los vendedores de la combinación.
--   5) impersonation_log: auditoría del "acceder como" del super_admin.

-- ============================================================================
-- 1) Multi-gerente — quitar UNIQUE(branch_id, product_type_id).
--    Ahora una combinación (sucursal, producto) puede tener N gerentes.
--    Evitamos solo que el MISMO gerente quede duplicado en la combinación.
-- ============================================================================

alter table public.managements
  drop constraint if exists managements_branch_id_product_type_id_key;

create unique index if not exists managements_branch_pt_manager_key
  on public.managements (branch_id, product_type_id, manager_id);

-- ============================================================================
-- 2) lead_vehicles — varias consultas (autos) por lead.
--    Los presupuestos/ventas siguen colgando del lead, no del vehículo.
--    Las columnas vehicle_* del lead se mantienen como "auto principal"
--    (denormalizado) para listados/export/CSV que ya las usan.
-- ============================================================================

create table public.lead_vehicles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_model text,
  vehicle_version text,
  preferred_color text,
  notes text,
  created_at timestamptz not null default now()
);

create index lead_vehicles_lead_idx on public.lead_vehicles (lead_id);
create index lead_vehicles_company_idx on public.lead_vehicles (company_id);

alter table public.lead_vehicles enable row level security;

-- Migración: el vehículo "principal" actual de cada lead pasa a ser su primera
-- consulta. Solo migra leads que tengan algún dato de vehículo.
insert into public.lead_vehicles
  (lead_id, company_id, vehicle_model, vehicle_version, preferred_color, created_at)
select id, company_id, vehicle_model, vehicle_version, preferred_color, created_at
from public.leads
where vehicle_model is not null
   or vehicle_version is not null
   or preferred_color is not null;

-- RLS — scoped por visibilidad del lead (mismo patrón que notes/tasks/visits).
create policy "lead_vehicles_select_by_lead"
  on public.lead_vehicles for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

create policy "lead_vehicles_insert_by_lead"
  on public.lead_vehicles for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "lead_vehicles_update_by_lead"
  on public.lead_vehicles for update to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_id));

create policy "lead_vehicles_delete_by_lead"
  on public.lead_vehicles for delete to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

-- ============================================================================
-- 3) last_contacted_at — última vez que se contactó al cliente.
--    Se bumpea al registrar una nota con activity_type, o al pasar a 'contacted'.
-- ============================================================================

alter table public.leads
  add column last_contacted_at timestamptz;

create index leads_last_contacted_idx on public.leads (last_contacted_at);

-- Backfill: última nota tipada de contacto por lead.
update public.leads l
set last_contacted_at = sub.last_at
from (
  select lead_id, max(created_at) as last_at
  from public.lead_notes
  where activity_type is not null
  group by lead_id
) sub
where sub.lead_id = l.id;

-- Trigger: nota con activity_type → bump last_contacted_at del lead.
create or replace function public.bump_last_contacted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.activity_type is not null then
    update public.leads
    set last_contacted_at =
      greatest(coalesce(last_contacted_at, new.created_at), new.created_at)
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

create trigger lead_notes_bump_contacted
  after insert on public.lead_notes
  for each row execute function public.bump_last_contacted();

-- Extender el trigger de status para que 'contacted' también marque contacto.
create or replace function public.leads_status_timestamp()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    new.status_changed_at = now();
    if new.status = 'contacted' then
      new.last_contacted_at = now();
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 4) auto_assign_lead — round-robin "pool" multi-gerente.
--    Habilitado si ALGUNA gerencia de la combinación tiene auto-asignación ON.
--    Candidatos: vendedores activos de CUALQUIER gerente de esa combinación,
--    con el tipo de producto en su user_product_types y en la misma sucursal.
-- ============================================================================

create or replace function public.auto_assign_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_enabled boolean;
  v_assignee uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found
     or v_lead.branch_id is null
     or v_lead.product_type_id is null
     or v_lead.assigned_user_id is not null then
    return null;
  end if;

  -- Auto-asignación activa si alguna gerencia de esta combinación la habilitó.
  select bool_or(auto_assignment_enabled) into v_enabled
  from managements
  where branch_id = v_lead.branch_id
    and product_type_id = v_lead.product_type_id;
  if v_enabled is not true then
    return null;
  end if;

  -- Pool: vendedores activos de todos los gerentes de la combinación.
  select p.id into v_assignee
  from profiles p
  join user_product_types upt
    on upt.user_id = p.id
   and upt.product_type_id = v_lead.product_type_id
  where p.company_id = v_lead.company_id
    and p.role = 'sales'
    and p.status = 'active'
    and p.branch_id = v_lead.branch_id
    and p.manager_id in (
      select m.manager_id from managements m
      where m.branch_id = v_lead.branch_id
        and m.product_type_id = v_lead.product_type_id
    )
  order by (
    select count(*) from leads l2
    where l2.assigned_user_id = p.id
      and l2.status in ('new', 'contacted', 'interested', 'quoted')
  ) asc, random()
  limit 1;

  if v_assignee is null then
    return null;
  end if;

  update leads
  set assigned_user_id = v_assignee,
      assigned_at = now()
  where id = p_lead_id;

  return v_assignee;
end;
$$;

-- ============================================================================
-- 5) impersonation_log — auditoría del "acceder como" del super_admin.
--    Escritura vía service_role (admin client); lectura solo super_admin.
-- ============================================================================

create table public.impersonation_log (
  id uuid primary key default gen_random_uuid(),
  super_admin_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index impersonation_log_super_idx
  on public.impersonation_log (super_admin_id);
create index impersonation_log_target_idx
  on public.impersonation_log (target_user_id);

alter table public.impersonation_log enable row level security;

create policy "impersonation_select_super_admin"
  on public.impersonation_log for select to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- Reglas de reparto de leads, unificadas.
--
-- El problema: cada puerta de entrada repartía distinto, con su propio mecanismo
-- y su propio vocabulario. Cinco caminos, cuatro funciones, y dos entradas que
-- directamente no asignaban:
--
--   Meta Lead Ads      assign_lead_from_form (4 modos, config pegada a la tabla)
--   Formulario propio  auto_assign_lead, sin ninguna config
--   Google Sheets      NADA — los leads quedaban en el pool sin que se notara
--   Carga masiva       bulk_assign_leads, elegido por corrida y sin persistir
--   WhatsApp/redes     assign_conversation_to_active_vendor (presencia)
--   Carga manual       auto_assign_lead
--
-- Agregar "70% a Juan" ahí significaba tocar cinco lugares. Ahora hay UNA regla
-- como entidad con nombre, y cada origen apunta a una.
--
-- TRES estrategias, no ocho. Round-robin es reparto por turno con pesos iguales,
-- y "vendedor fijo" es una rueda de un solo lugar: son el mismo motor. La UI
-- muestra cuatro opciones; acá abajo hay dos caminos de código más "no asignar".
--
--   balanced  el que menos leads abiertos tenga, dentro de la gerencia.
--             Es exactamente lo que hace auto_assign_lead hoy, sin cambios.
--   turns     rueda determinística con pesos. Cubre round-robin (pesos iguales),
--             % por vendedor, y vendedor fijo (un solo miembro).
--   pool      sin asignar.
--
-- INVARIANTE, no opción: si en el momento del lead nadie califica, va al pool.
-- Convertirlo en regla fija y no en configuración elimina la posibilidad de
-- configurarlo mal. Nunca se pierde un lead.
--
-- Esta migración NO cambia el comportamiento de nada: el backfill de abajo deja
-- cada origen con una regla que reproduce lo que ya hacía.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_assignment_strategy') then
    create type public.lead_assignment_strategy as enum ('balanced', 'turns', 'pool');
  end if;
end
$$;

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  strategy public.lead_assignment_strategy not null default 'balanced',
  -- Turno de la rueda. Sólo sube; el módulo se aplica al leer, así agregar o
  -- sacar un vendedor no reinicia la rotación desde el primero.
  turn_cursor bigint not null default 0,
  -- La regla de la empresa: la que usan los orígenes sin regla propia.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assignment_rules_one_default_idx
  on public.assignment_rules (company_id) where is_default;
create index if not exists assignment_rules_company_idx
  on public.assignment_rules (company_id);

create trigger assignment_rules_set_updated_at
  before update on public.assignment_rules
  for each row execute function public.set_updated_at();

-- Los vendedores de una regla `turns`, con su peso. El peso es la cantidad de
-- lugares que ocupa en la rueda: 70/30 son 7 y 3, no "70%" y "30%". La UI
-- muestra porcentajes y los normaliza al guardar.
create table if not exists public.assignment_rule_members (
  rule_id uuid not null references public.assignment_rules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  weight integer not null default 1 check (weight between 1 and 100),
  primary key (rule_id, user_id)
);
create index if not exists assignment_rule_members_rule_idx
  on public.assignment_rule_members (rule_id);

alter table public.assignment_rules enable row level security;
alter table public.assignment_rule_members enable row level security;

-- Lectura para toda la empresa (el vendedor puede ver por qué le tocan leads).
-- La escritura va por service-role desde las server actions, igual que el resto
-- de la configuración de orígenes.
drop policy if exists assignment_rules_select on public.assignment_rules;
create policy assignment_rules_select on public.assignment_rules
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );

drop policy if exists assignment_rule_members_select on public.assignment_rule_members;
create policy assignment_rule_members_select on public.assignment_rule_members
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );

-- ----------------------------------------------------------------------------
-- Cada origen apunta a una regla. NULL = usa la regla de la empresa.
-- ----------------------------------------------------------------------------
alter table public.lead_ad_forms
  add column if not exists assignment_rule_id uuid
    references public.assignment_rules(id) on delete set null;
alter table public.lead_capture_forms
  add column if not exists assignment_rule_id uuid
    references public.assignment_rules(id) on delete set null;
alter table public.sheet_sources
  add column if not exists assignment_rule_id uuid
    references public.assignment_rules(id) on delete set null;
alter table public.messaging_channels
  add column if not exists assignment_rule_id uuid
    references public.assignment_rules(id) on delete set null;

-- OBSOLETAS: lead_ad_forms.assignment_mode / assigned_user_id / rr_cursor y la
-- tabla lead_ad_form_vendors. Quedaron de la primera versión de esto, que vivía
-- pegada al formulario. El backfill de abajo las pasa a reglas y el código ya no
-- las lee. No se borran en esta migración a propósito: primero que corra en
-- producción, después se limpian.

-- ----------------------------------------------------------------------------
-- La rueda.
--
-- Interpola los lugares en vez de agruparlos: con 70/30 da J P J J J P J J P J,
-- no siete Juan seguidos y después tres Pedro. Cada vendedor con peso w ocupa
-- las posiciones (k + 0.5) / w para k en 0..w-1; ordenar esas fracciones mezcla
-- los turnos parejo. Es determinístico y no guarda estado por miembro.
--
-- Filtra a los vendedores que siguen activos: una regla que nombra a alguien
-- dado de baja no le asigna nada.
-- ----------------------------------------------------------------------------
create or replace function public.assignment_wheel(p_rule_id uuid)
-- `slot` y no `position`: POSITION es palabra reservada de Postgres y no se
-- puede usar como nombre de columna en un RETURNS TABLE sin comillas.
returns table (slot integer, user_id uuid)
language sql
stable
as $$
  with slots as (
    select
      m.user_id as uid,
      m.weight as w,
      generate_series(0, m.weight - 1) as k
    from public.assignment_rule_members m
    join public.profiles p on p.id = m.user_id
    where m.rule_id = p_rule_id
      and p.role = 'sales'::public.user_role
      and p.status = 'active'
  )
  select
    (row_number() over (order by (s.k + 0.5) / s.w, s.uid))::int - 1,
    s.uid
  from slots s;
$$;

grant execute on function public.assignment_wheel(uuid) to authenticated, service_role;

-- Resuelve la regla efectiva de un origen: la propia, o la de la empresa.
create or replace function public.effective_assignment_rule(
  p_company_id uuid,
  p_rule_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.id from public.assignment_rules r
      where r.id = p_rule_id and r.company_id = p_company_id),
    (select r.id from public.assignment_rules r
      where r.company_id = p_company_id and r.is_default)
  );
$$;

grant execute on function public.effective_assignment_rule(uuid, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- assign_lead — el único punto de asignación de un lead.
-- Devuelve el vendedor, o null si queda en el pool. Idempotente.
-- ----------------------------------------------------------------------------
create or replace function public.assign_lead(
  p_lead_id uuid,
  p_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_rule public.assignment_rules%rowtype;
  v_rule_id uuid;
  v_assignee uuid;
  v_size int;
  v_turn bigint;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or v_lead.assigned_user_id is not null then
    return null;
  end if;

  v_rule_id := public.effective_assignment_rule(v_lead.company_id, p_rule_id);
  if v_rule_id is null then
    -- Empresa sin regla configurada: el comportamiento histórico.
    return public.auto_assign_lead(p_lead_id);
  end if;
  select * into v_rule from public.assignment_rules where id = v_rule_id;

  if v_rule.strategy = 'pool' then
    return null;
  end if;

  if v_rule.strategy = 'balanced' then
    return public.auto_assign_lead(p_lead_id);
  end if;

  -- turns
  select count(*) into v_size from public.assignment_wheel(v_rule_id);
  if v_size = 0 then
    return null; -- invariante: nadie califica → pool
  end if;

  -- El UPDATE toma el lock de la fila de la regla: dos leads simultáneos se
  -- llevan turnos distintos en vez de pisarse.
  update public.assignment_rules
  set turn_cursor = turn_cursor + 1
  where id = v_rule_id
  returning turn_cursor into v_turn;

  select w.user_id into v_assignee
  from public.assignment_wheel(v_rule_id) w
  where w.slot = ((v_turn - 1) % v_size)::int;

  if v_assignee is null then
    return null;
  end if;

  update public.leads
  set assigned_user_id = v_assignee,
      assigned_at = now()
  where id = p_lead_id
    and assigned_user_id is null;

  return v_assignee;
end;
$$;

grant execute on function public.assign_lead(uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- assign_leads_bulk — la carga masiva, en UNA sentencia.
--
-- Un lote de 3000 no se puede asignar de a uno: serían 3000 round-trips y el
-- timeout de la función serverless. Se mapea row_number() del lote contra la
-- rueda, que es la misma que usa el lead a lead, así el % sale igual.
-- ----------------------------------------------------------------------------
create or replace function public.assign_leads_bulk(
  p_lead_ids uuid[],
  p_rule_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_rule public.assignment_rules%rowtype;
  v_rule_id uuid;
  v_size int;
  v_base bigint;
  v_assigned int := 0;
begin
  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    return 0;
  end if;

  select company_id into v_company
  from public.leads where id = any(p_lead_ids) limit 1;
  if v_company is null then
    return 0;
  end if;

  v_rule_id := public.effective_assignment_rule(v_company, p_rule_id);
  if v_rule_id is null then
    return public.bulk_assign_leads(p_lead_ids);
  end if;
  select * into v_rule from public.assignment_rules where id = v_rule_id;

  if v_rule.strategy = 'pool' then
    return 0;
  end if;
  if v_rule.strategy = 'balanced' then
    return public.bulk_assign_leads(p_lead_ids);
  end if;

  select count(*) into v_size from public.assignment_wheel(v_rule_id);
  if v_size = 0 then
    return 0;
  end if;

  update public.assignment_rules
  set turn_cursor = turn_cursor + array_length(p_lead_ids, 1)
  where id = v_rule_id
  returning turn_cursor - array_length(p_lead_ids, 1) into v_base;

  with wheel as (
    select slot, user_id from public.assignment_wheel(v_rule_id)
  ),
  tgt as (
    select
      l.id as lead_id,
      (row_number() over (order by l.created_at, l.id) - 1) as seq
    from public.leads l
    where l.id = any(p_lead_ids)
      and l.assigned_user_id is null
      and l.company_id = v_company
  )
  update public.leads L
  set assigned_user_id = w.user_id,
      assigned_at = now()
  from tgt
  join wheel w on w.slot = ((v_base + tgt.seq) % v_size)::int
  where L.id = tgt.lead_id;

  get diagnostics v_assigned = row_count;
  return v_assigned;
end;
$$;

grant execute on function public.assign_leads_bulk(uuid[], uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- assign_conversation_by_rule — WhatsApp / Instagram / Facebook.
--
-- El inbox reparte CONVERSACIONES, no leads (el lead después sigue a la
-- conversación, eso ya estaba). Sin regla propia o con `balanced` se delega en
-- la presencia del call center: mismo comportamiento de siempre, con sus
-- horarios y su tope de overflow. Con `turns` manda la rueda.
-- ----------------------------------------------------------------------------
create or replace function public.assign_conversation_by_rule(
  p_conversation_id uuid,
  p_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_rule public.assignment_rules%rowtype;
  v_rule_id uuid;
  v_assignee uuid;
  v_size int;
  v_turn bigint;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.assigned_user_id is not null then
    return null;
  end if;

  v_rule_id := public.effective_assignment_rule(v_conv.company_id, p_rule_id);
  if v_rule_id is null then
    return public.assign_conversation_to_active_vendor(p_conversation_id);
  end if;
  select * into v_rule from public.assignment_rules where id = v_rule_id;

  if v_rule.strategy = 'pool' then
    return null;
  end if;
  if v_rule.strategy = 'balanced' then
    return public.assign_conversation_to_active_vendor(p_conversation_id);
  end if;

  select count(*) into v_size from public.assignment_wheel(v_rule_id);
  if v_size = 0 then
    return null;
  end if;

  update public.assignment_rules
  set turn_cursor = turn_cursor + 1
  where id = v_rule_id
  returning turn_cursor into v_turn;

  select w.user_id into v_assignee
  from public.assignment_wheel(v_rule_id) w
  where w.slot = ((v_turn - 1) % v_size)::int;

  if v_assignee is null then
    return null;
  end if;

  update public.conversations
  set assigned_user_id = v_assignee,
      claimed_at = now()
  where id = p_conversation_id
    and assigned_user_id is null;

  return v_assignee;
end;
$$;

grant execute on function public.assign_conversation_by_rule(uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- Backfill — cada origen queda con una regla que reproduce lo que ya hacía.
-- Después de esto, el comportamiento es idéntico al de antes de la migración.
-- ============================================================================

-- La regla de la empresa: "Equilibrado", que es auto_assign_lead. La usan todos
-- los orígenes que hoy no tienen config propia (formularios propios, canales de
-- mensajería, carga manual, y los formularios de Meta en modo automático).
insert into public.assignment_rules (company_id, name, strategy, is_default)
select c.id, 'Equilibrado', 'balanced', true
from public.companies c
where not exists (
  select 1 from public.assignment_rules r
  where r.company_id = c.id and r.is_default
);

-- Regla "Sin asignar" por empresa. La necesitan los orígenes que hoy NO asignan
-- y que sin esto pasarían a repartir solos por heredar la default — un cambio
-- de comportamiento silencioso, que es justo lo que este backfill evita.
insert into public.assignment_rules (company_id, name, strategy)
select c.id, 'Sin asignar', 'pool'
from public.companies c
where not exists (
  select 1 from public.assignment_rules r
  where r.company_id = c.id and r.strategy = 'pool' and r.name = 'Sin asignar'
);

-- Google Sheets nunca llamó a ninguna función de asignación: sus leads caían al
-- pool. Queda explícito en vez de implícito, y ahora se puede cambiar.
update public.sheet_sources s
set assignment_rule_id = (
  select r.id from public.assignment_rules r
  where r.company_id = s.company_id and r.strategy = 'pool' and r.name = 'Sin asignar'
  limit 1
)
where s.assignment_rule_id is null;

-- Formularios de Meta en modo 'pool' → la misma regla compartida.
update public.lead_ad_forms f
set assignment_rule_id = (
  select r.id from public.assignment_rules r
  where r.company_id = f.company_id and r.strategy = 'pool' and r.name = 'Sin asignar'
  limit 1
)
where f.assignment_mode = 'pool' and f.assignment_rule_id is null;

-- Formularios de Meta con vendedor fijo → una regla `turns` de un solo lugar.
with nuevas as (
  insert into public.assignment_rules (company_id, name, strategy)
  select
    f.company_id,
    'Reparto de ' || coalesce(nullif(trim(f.form_name), ''), f.meta_form_id),
    'turns'
  from public.lead_ad_forms f
  where f.assignment_mode = 'fixed'
    and f.assigned_user_id is not null
    and f.assignment_rule_id is null
  returning id, company_id, name
)
update public.lead_ad_forms f
set assignment_rule_id = n.id
from nuevas n
where n.company_id = f.company_id
  and n.name = 'Reparto de ' || coalesce(nullif(trim(f.form_name), ''), f.meta_form_id)
  and f.assignment_mode = 'fixed'
  and f.assignment_rule_id is null;

insert into public.assignment_rule_members (rule_id, user_id, company_id, weight)
select f.assignment_rule_id, f.assigned_user_id, f.company_id, 1
from public.lead_ad_forms f
where f.assignment_mode = 'fixed'
  and f.assigned_user_id is not null
  and f.assignment_rule_id is not null
on conflict do nothing;

-- Formularios de Meta en round-robin → regla `turns` con pesos iguales, que es
-- exactamente lo que hacía la rotación anterior.
with nuevas as (
  insert into public.assignment_rules (company_id, name, strategy)
  select
    f.company_id,
    'Reparto de ' || coalesce(nullif(trim(f.form_name), ''), f.meta_form_id),
    'turns'
  from public.lead_ad_forms f
  where f.assignment_mode = 'round_robin'
    and f.assignment_rule_id is null
  returning id, company_id, name
)
update public.lead_ad_forms f
set assignment_rule_id = n.id
from nuevas n
where n.company_id = f.company_id
  and n.name = 'Reparto de ' || coalesce(nullif(trim(f.form_name), ''), f.meta_form_id)
  and f.assignment_mode = 'round_robin'
  and f.assignment_rule_id is null;

insert into public.assignment_rule_members (rule_id, user_id, company_id, weight)
select f.assignment_rule_id, v.user_id, f.company_id, 1
from public.lead_ad_forms f
join public.lead_ad_form_vendors v on v.form_id = f.id
where f.assignment_mode = 'round_robin'
  and f.assignment_rule_id is not null
on conflict do nothing;

comment on table public.assignment_rules is
  'Reglas de reparto de leads. Cada origen (formulario de Meta, formulario propio, planilla, canal de mensajería, carga masiva) apunta a una; sin regla propia usa la default de la empresa. Ver docs/reparto-de-leads.md.';

-- ============================================================================
-- Reparto de leads por FORMULARIO de Meta Lead Ads.
--
-- Hasta ahora el mapeo de un formulario decidía sucursal / tipo / campaña, y el
-- vendedor lo elegía siempre lo mismo: `auto_assign_lead` (round-robin por
-- menor carga entre los vendedores de la gerencia, y sólo si esa gerencia tiene
-- la asignación automática prendida). No había forma de decir "los leads de
-- ESTE formulario los atiende Fulano", que es justo lo que pide una campaña de
-- un modelo puntual o de una acción de un vendedor.
--
-- Cuatro modos por formulario:
--   auto        — como hasta hoy: `auto_assign_lead` (gerencia + menor carga).
--   round_robin — rotación estricta entre los vendedores elegidos para el form.
--   fixed       — siempre al mismo vendedor.
--   pool        — sin asignar; queda en el pool para que lo tome quien quiera.
--
-- "auto" vs "round_robin": auto reparte por CARGA (el que menos leads abiertos
-- tiene) y depende del toggle de la gerencia; round_robin reparte por TURNO
-- entre una lista explícita, sin mirar carga ni gerencia. Son dos criterios
-- distintos y los dos se piden: el primero balancea, el segundo es previsible.
--
-- Aplica a los leads que entran EN VIVO por el webhook. El import histórico
-- sigue dejando todo sin asignar a propósito (no tiene sentido meterle miles de
-- leads viejos a un vendedor por rotación).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_assignment_mode') then
    create type public.lead_assignment_mode as enum (
      'auto',
      'round_robin',
      'fixed',
      'pool'
    );
  end if;
end
$$;

alter table public.lead_ad_forms
  add column if not exists assignment_mode public.lead_assignment_mode
    not null default 'auto',
  -- Vendedor de `fixed`. on delete set null + el fallback del modo: si al
  -- vendedor lo dan de baja, el form no queda apuntando a un fantasma.
  add column if not exists assigned_user_id uuid
    references public.profiles(id) on delete set null,
  -- Turno de la rotación de `round_robin`. Contador que sólo sube: avanza
  -- dentro de la función de asignación (con el lock del UPDATE), así dos leads
  -- que entran a la vez se llevan turnos distintos en vez de pisarse. bigint
  -- para no tener que pensar nunca en el desborde.
  add column if not exists rr_cursor bigint not null default 0;

-- ----------------------------------------------------------------------------
-- lead_ad_form_vendors — los vendedores que entran en la rotación de un form.
-- `company_id` denormalizado para RLS, igual que en campaign_branches.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_ad_form_vendors (
  form_id uuid not null references public.lead_ad_forms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (form_id, user_id)
);

create index if not exists lead_ad_form_vendors_form_idx
  on public.lead_ad_form_vendors (form_id);

alter table public.lead_ad_form_vendors enable row level security;

drop policy if exists lafv_select on public.lead_ad_form_vendors;
create policy lafv_select on public.lead_ad_form_vendors
  for select to authenticated
  using (
    (select public.is_super_admin())
    or company_id = (select public.current_company_id())
  );

-- La escritura de la configuración de formularios pasa por el service-role
-- (`createAdminClient`), igual que `lead_ad_forms`: no hay policies de write.

-- ----------------------------------------------------------------------------
-- assign_lead_from_form — decide y aplica el vendedor de un lead de Lead Ads.
--
-- Devuelve el vendedor asignado, o null si el lead queda en el pool.
-- Idempotente: si el lead ya tiene vendedor, no toca nada.
-- ----------------------------------------------------------------------------
create or replace function public.assign_lead_from_form(
  p_lead_id uuid,
  p_meta_form_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_form public.lead_ad_forms%rowtype;
  v_assignee uuid;
  v_ids uuid[];
  v_turn bigint;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or v_lead.assigned_user_id is not null then
    return null;
  end if;

  select * into v_form
  from public.lead_ad_forms
  where company_id = v_lead.company_id
    and meta_form_id = p_meta_form_id;

  -- Sin mapeo del formulario, el comportamiento histórico: gerencia + carga.
  if not found or v_form.assignment_mode = 'auto' then
    return public.auto_assign_lead(p_lead_id);
  end if;

  if v_form.assignment_mode = 'pool' then
    return null;
  end if;

  if v_form.assignment_mode = 'fixed' then
    select p.id into v_assignee
    from public.profiles p
    where p.id = v_form.assigned_user_id
      and p.company_id = v_lead.company_id
      and p.role = 'sales'::public.user_role
      and p.status = 'active';

  elsif v_form.assignment_mode = 'round_robin' then
    -- Sólo los vendedores elegidos que siguen activos. Orden estable (por id)
    -- para que el turno signifique siempre lo mismo entre llamadas.
    select array_agg(p.id order by p.id) into v_ids
    from public.lead_ad_form_vendors v
    join public.profiles p on p.id = v.user_id
    where v.form_id = v_form.id
      and p.company_id = v_lead.company_id
      and p.role = 'sales'::public.user_role
      and p.status = 'active';

    if v_ids is null or array_length(v_ids, 1) is null then
      return null;
    end if;

    -- El UPDATE ... RETURNING toma el lock de la fila del form: dos leads que
    -- entran a la vez se llevan turnos distintos en vez de pisarse. El módulo
    -- se aplica al LEER, no al guardar: así agregar o sacar un vendedor de la
    -- lista no reinicia la rotación desde el primero.
    update public.lead_ad_forms
    set rr_cursor = rr_cursor + 1
    where id = v_form.id
    returning rr_cursor into v_turn;

    v_assignee := v_ids[(((v_turn - 1) % array_length(v_ids, 1))::int) + 1];
  end if;

  -- Ningún candidato válido (vendedor dado de baja, lista vacía): pool. No
  -- caemos a `auto` a propósito — si alguien configuró a mano quién atiende
  -- este formulario, sorprenderlo con otro vendedor es peor que dejar el lead
  -- visible en el pool para que lo tome quien esté.
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

grant execute on function public.assign_lead_from_form(uuid, text)
  to authenticated, service_role;

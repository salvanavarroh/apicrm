-- ============================================================================
-- La presencia del inbox deja de apagarse por usar otra aplicación.
--
-- El vendedor se marcaba "Activo", se iba a un Excel veinte minutos y al volver
-- figuraba "Inactivo". No es que algo lo apagara: nada pone `inbox_available`
-- en false salvo el propio toggle, cerrar sesión, y el beacon de `pagehide`
-- —que además ignora el paso a segundo plano a propósito—. Lo que pasaba es que
-- CADUCABA: "activo" se calculaba como el flag MÁS un latido de menos de 15
-- minutos, y el navegador congela los timers de una pestaña en segundo plano.
--
-- Con una ventana corta, cualquier rato fuera de la pestaña te saca del reparto.
-- Así que la ventana pasa a ser una RED DE SEGURIDAD y no un control de
-- presencia: cubre una jornada entera, y quien apaga de verdad es
--
--   · el toggle,
--   · cerrar sesión,
--   · el beacon al cerrar la pestaña o el navegador,
--   · y el cron nocturno (/api/cron/clear-presence), que atrapa el caso que la
--     ventana larga deja abierto: el que se fue a su casa con el browser
--     abierto y la máquina suspendida, donde el beacon nunca llega a dispararse.
--
-- El cron hace falta especialmente acá: ninguna de las concesionarias tiene
-- horario de atención configurado, así que sin él una sesión olvidada seguiría
-- recibiendo conversaciones toda la noche.
-- ============================================================================

create or replace function public.assign_conversation_to_active_vendor(
  p_conversation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_co public.companies%rowtype;
  v_assignee uuid;
  -- Red de seguridad de una jornada, no control de presencia. Ver el encabezado.
  v_stale timestamptz := now() - interval '8 hours';
  v_tz text;
  v_dow int;
  v_time time;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.assigned_user_id is not null then
    return null;
  end if;
  select * into v_co from public.companies where id = v_conv.company_id;

  -- Horario de atención: fuera de hora/día → no se reparte (queda en el pool).
  if v_co.inbox_hours_enabled then
    v_tz := coalesce(v_co.inbox_tz, 'America/Argentina/Buenos_Aires');
    v_dow := extract(isodow from (now() at time zone v_tz))::int;
    v_time := (now() at time zone v_tz)::time;
    if v_co.inbox_hours_days is not null
       and not (v_dow = any(v_co.inbox_hours_days)) then
      return null;
    end if;
    if v_co.inbox_hours_start is not null
       and v_co.inbox_hours_end is not null
       and (v_time < v_co.inbox_hours_start or v_time > v_co.inbox_hours_end) then
      return null;
    end if;
  end if;

  -- Vendedor activo (presencia fresca) de la sucursal (o cualquiera si general),
  -- round-robin por menor carga + azar, respetando el tope de overflow.
  select p.id into v_assignee
  from public.profiles p
  where p.company_id = v_conv.company_id
    and p.role = 'sales'::public.user_role
    and p.status = 'active'
    and p.inbox_available = true
    and p.inbox_available_at is not null
    and p.inbox_available_at > v_stale
    and (v_conv.branch_id is null or p.branch_id = v_conv.branch_id)
    and (
      v_co.inbox_max_open_per_vendor is null
      or (
        select count(*) from public.conversations c2
        where c2.assigned_user_id = p.id
          and c2.status <> 'closed'::public.conversation_status
      ) < v_co.inbox_max_open_per_vendor
    )
  order by (
    select count(*) from public.conversations c2
    where c2.assigned_user_id = p.id
      and c2.status <> 'closed'::public.conversation_status
  ) asc, random()
  limit 1;

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

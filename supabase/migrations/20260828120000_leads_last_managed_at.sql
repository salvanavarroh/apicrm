-- ============================================================================
-- `last_managed_at`: cuándo se gestionó el lead por última vez.
--
-- EL PROBLEMA
-- "Sin gestión +7d" se calculaba con `status_changed_at`, o sea con el tiempo
-- que el lead lleva en la misma columna del pipeline. No es lo mismo. Reportado
-- por un vendedor de Piamonte: completó la tarea de seguimiento, agendó la
-- siguiente para la semana que viene, y la ficha le seguía diciendo "14 d sin
-- gestión". Tenía razón: un lead presupuestado que se trabaja todas las semanas
-- no cambia de estado, y con la cuenta vieja quedaba marcado como abandonado
-- para siempre. Al revés también fallaba: mover una tarjeta de columna
-- "limpiaba" el atraso sin que nadie hubiera hablado con el cliente.
--
-- LA REGLA
-- Gestionar es dejar rastro de trabajo sobre el lead:
--   · una nota o actividad registrada
--   · crear una tarea (agendar el próximo paso ES gestión)
--   · completar una tarea
--   · agendar una visita
--   · responderle por el inbox
--   · mover el estado del pipeline
--
-- `status_changed_at` no se toca: sigue midiendo tiempo en la etapa, que es lo
-- que usa el informe ejecutivo para el embudo.
-- ============================================================================

alter table public.leads
  add column last_managed_at timestamptz not null default now();

-- Backfill: lo más reciente entre el alta, el cambio de estado, el último
-- contacto, la última nota, la última tarea (creada o completada) y la última
-- visita. Así nadie aparece atrasado por estrenar la columna.
update public.leads l
set last_managed_at = greatest(
  l.created_at,
  l.status_changed_at,
  coalesce(l.last_contacted_at, l.created_at),
  coalesce((select max(n.created_at) from public.lead_notes n where n.lead_id = l.id), l.created_at),
  coalesce((select max(greatest(t.created_at, coalesce(t.completed_at, t.created_at)))
              from public.lead_tasks t where t.lead_id = l.id), l.created_at),
  coalesce((select max(v.created_at) from public.visits v where v.lead_id = l.id), l.created_at)
);

-- El índice que usan el filtro "sin gestión" y los contadores del encabezado.
create index leads_last_managed_idx on public.leads (last_managed_at);

-- ---------------------------------------------------------------------------
-- Bump genérico. `security definer` porque lo disparan inserts de vendedores,
-- que no tienen permiso de update sobre cualquier lead.
-- ---------------------------------------------------------------------------
create or replace function public.bump_last_managed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Todos los triggers que la usan son AFTER INSERT o AFTER UPDATE, así que NEW
  -- siempre está: no se toca OLD (en un INSERT no está asignado y plpgsql corta).
  if new.lead_id is not null then
    update public.leads
    set last_managed_at = greatest(last_managed_at, now())
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

create trigger lead_notes_bump_managed
  after insert on public.lead_notes
  for each row execute function public.bump_last_managed();

-- Crear la tarea (agendar el próximo paso) y completarla cuentan las dos.
create trigger lead_tasks_bump_managed_ins
  after insert on public.lead_tasks
  for each row execute function public.bump_last_managed();

create trigger lead_tasks_bump_managed_done
  after update of completed_at on public.lead_tasks
  for each row
  when (old.completed_at is null and new.completed_at is not null)
  execute function public.bump_last_managed();

create trigger visits_bump_managed
  after insert on public.visits
  for each row execute function public.bump_last_managed();

-- ---------------------------------------------------------------------------
-- Mensajes salientes del inbox: contestarle al cliente es gestión. El trigger
-- va por `conversation_id`, que es de donde sale el lead.
-- ---------------------------------------------------------------------------
create or replace function public.bump_last_managed_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'outbound' then
    update public.leads
    set last_managed_at = greatest(last_managed_at, now())
    where id = (
      select c.lead_id from public.conversations c where c.id = new.conversation_id
    );
  end if;
  return new;
end;
$$;

create trigger messages_bump_managed
  after insert on public.messages
  for each row execute function public.bump_last_managed_from_message();

-- ---------------------------------------------------------------------------
-- Cambio de estado: se mantiene el trigger existente y se le agrega el bump.
-- ---------------------------------------------------------------------------
create or replace function public.leads_status_timestamp()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    new.status_changed_at = now();
    new.last_managed_at = now();
    if new.status = 'contacted' then
      new.last_contacted_at = now();
    end if;
  end if;
  return new;
end;
$$;

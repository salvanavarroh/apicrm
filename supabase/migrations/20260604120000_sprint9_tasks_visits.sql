-- Sprint 9 — Tareas tipadas + Visitas + permisos extendidos.
-- 1) Refactor lead_tasks:
--    - task_type enum reemplaza al título libre (dropdown de tipos).
--    - assigned_to: a quién está asignada la tarea (puede no ser el vendor del lead).
--    - due_date pasa de timestamptz → date (fix bug TZ: AR offset corría -1 día).
-- 2) Nueva entidad visits (agenda de visitas a la concesionaria).
-- 3) RLS para visits siguiendo el patrón de tasks/notes (scope por lead).

-- ============================================================================
-- lead_tasks: task_type + assigned_to + due_date como DATE
-- ============================================================================

create type public.task_type as enum (
  'call',         -- Llamar al cliente
  'meeting',      -- Coordinar reunión
  'quote_send',   -- Enviar presupuesto
  'follow_up',    -- Seguimiento
  'document',     -- Documentación
  'other'         -- Otro
);

alter table public.lead_tasks
  add column task_type public.task_type not null default 'other',
  add column assigned_to uuid references public.profiles(id) on delete set null;

-- due_date: timestamptz → date (descarta el time, que nunca usamos).
-- Cast al timezone de AR (-03) para no corrernos un día en filas pre-existentes.
alter table public.lead_tasks
  alter column due_date type date
  using (due_date at time zone 'America/Argentina/Buenos_Aires')::date;

-- title sigue existiendo pero ya no es required en el form nuevo. Lo dejo
-- nullable para no romper filas viejas; el código nuevo no lo escribe.
alter table public.lead_tasks
  alter column title drop not null;

-- Drop check que requería length > 0 en title.
alter table public.lead_tasks
  drop constraint if exists lead_tasks_title_check;

create index if not exists lead_tasks_assigned_to_idx
  on public.lead_tasks (assigned_to);

-- ============================================================================
-- visits
-- ============================================================================

create type public.visit_status as enum (
  'scheduled',  -- Agendada
  'completed',  -- Realizada
  'no_show',    -- No vino
  'canceled'    -- Cancelada
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz not null,
  notes text,
  status public.visit_status not null default 'scheduled',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

create index visits_lead_idx on public.visits (lead_id);
create index visits_company_idx on public.visits (company_id);
create index visits_scheduled_idx on public.visits (scheduled_at);
create index visits_assigned_idx on public.visits (assigned_to);

alter table public.visits enable row level security;

-- RLS scoped por visibilidad del lead (la RLS de leads ya filtra por rol).
create policy "visits_select_by_lead"
  on public.visits for select to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "visits_insert_by_lead"
  on public.visits for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "visits_update_by_lead"
  on public.visits for update to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  )
  with check (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "visits_delete_by_lead"
  on public.visits for delete to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

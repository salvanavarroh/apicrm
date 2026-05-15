-- Sprint 5 — Notas + Tareas de leads + helpers para asignación auto.
-- PRD §6.12, §6.11.

-- ============================================================================
-- task_priority enum
-- ============================================================================

create type public.task_priority as enum ('low', 'medium', 'high');

-- ============================================================================
-- lead_notes
-- ============================================================================

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now()
);

create index lead_notes_lead_idx on public.lead_notes (lead_id);
create index lead_notes_company_idx on public.lead_notes (company_id);

alter table public.lead_notes enable row level security;

-- ============================================================================
-- lead_tasks
-- ============================================================================

create table public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (length(title) > 0),
  description text,
  priority task_priority not null default 'medium',
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lead_tasks_set_updated_at
  before update on public.lead_tasks
  for each row execute function public.set_updated_at();

create index lead_tasks_lead_idx on public.lead_tasks (lead_id);
create index lead_tasks_due_idx on public.lead_tasks (due_date);
create index lead_tasks_company_idx on public.lead_tasks (company_id);

alter table public.lead_tasks enable row level security;

-- ============================================================================
-- RLS — scoped por visibilidad del lead (la RLS de leads ya filtra por rol).
-- ============================================================================

create policy "notes_select_by_lead"
  on public.lead_notes for select to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "notes_insert_by_lead"
  on public.lead_notes for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

-- Notas: nadie edita ni borra (audit trail).

create policy "tasks_select_by_lead"
  on public.lead_tasks for select to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "tasks_insert_by_lead"
  on public.lead_tasks for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "tasks_update_by_lead"
  on public.lead_tasks for update to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  )
  with check (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "tasks_delete_by_lead"
  on public.lead_tasks for delete to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

-- ============================================================================
-- Helper: auto-asignar lead vía round-robin balanced (menos leads asignados).
-- Se llama desde el server action después de createLead / classifyLead.
-- ============================================================================

create or replace function public.auto_assign_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_management managements%rowtype;
  v_assignee uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found
     or v_lead.branch_id is null
     or v_lead.product_type_id is null
     or v_lead.assigned_user_id is not null then
    return null;
  end if;

  select * into v_management
  from managements
  where branch_id = v_lead.branch_id
    and product_type_id = v_lead.product_type_id;
  if not found or not v_management.auto_assignment_enabled then
    return null;
  end if;

  -- Pick the active sales user con menos leads activos asignados que tenga el
  -- product_type en su user_product_types.
  select p.id into v_assignee
  from profiles p
  join user_product_types upt
    on upt.user_id = p.id
   and upt.product_type_id = v_lead.product_type_id
  where p.company_id = v_lead.company_id
    and p.role = 'sales'
    and p.status = 'active'
    and p.manager_id = v_management.manager_id
    and p.branch_id = v_lead.branch_id
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

grant execute on function public.auto_assign_lead(uuid) to authenticated;

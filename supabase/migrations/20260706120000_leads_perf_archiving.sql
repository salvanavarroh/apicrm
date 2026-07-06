-- ============================================================================
-- Rendimiento de leads a escala (sucursales con +5000 leads) + archivado.
--
-- 1) `archived_at`: dar de baja un lead lo saca de TODAS las vistas normales
--    (kanban, tabla, conteos, asignación). Ortogonal al status (conserva su
--    etapa de pipeline). Se filtra `archived_at is null` en las queries.
-- 2) Índices compuestos parciales (where archived_at is null) para los patrones
--    reales de acceso: listar por empresa/vendedor ordenado por fecha, y kanban
--    por estado dentro de una gerencia / del vendedor.
-- 3) RPCs de conteo (SECURITY INVOKER → respetan RLS) para no traer miles de
--    filas sólo para contar:
--      - active_lead_counts: carga activa por vendedor (reemplaza el fetch-all
--        que además topaba en 1000 → conteos mal).
--      - lead_status_counts: conteo por estado para el header del kanban.
-- ============================================================================

alter table public.leads
  add column if not exists archived_at timestamptz;

-- Índices para listar/ordenar (excluyen archivados).
create index if not exists leads_company_created_active_idx
  on public.leads (company_id, created_at desc)
  where archived_at is null;

create index if not exists leads_assigned_created_active_idx
  on public.leads (assigned_user_id, created_at desc)
  where archived_at is null;

-- Kanban por estado dentro de una gerencia (manager/admin).
create index if not exists leads_bpt_status_active_idx
  on public.leads (branch_id, product_type_id, status, created_at desc)
  where archived_at is null;

-- Kanban por estado del vendedor (sales).
create index if not exists leads_assigned_status_active_idx
  on public.leads (assigned_user_id, status, created_at desc)
  where archived_at is null;

-- Vista de archivados (poco frecuente, pero acotada).
create index if not exists leads_archived_idx
  on public.leads (company_id, archived_at desc)
  where archived_at is not null;

-- ----------------------------------------------------------------------------
-- Carga activa por vendedor. SECURITY INVOKER: corre con los permisos del que
-- llama, así que RLS scopea los leads visibles. Excluye 'closed' y archivados.
-- ----------------------------------------------------------------------------
create or replace function public.active_lead_counts(p_user_ids uuid[])
returns table (user_id uuid, cnt bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select assigned_user_id, count(*)
  from leads
  where assigned_user_id = any(p_user_ids)
    and status <> 'closed'
    and archived_at is null
  group by assigned_user_id;
$$;

grant execute on function public.active_lead_counts(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Conteo por estado (para el header de columnas del kanban). RLS scopea al
-- alcance del que llama (gerencia / vendedor / empresa).
-- ----------------------------------------------------------------------------
create or replace function public.lead_status_counts()
returns table (status public.lead_status, cnt bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select status, count(*)
  from leads
  where archived_at is null
  group by status;
$$;

grant execute on function public.lead_status_counts() to authenticated;

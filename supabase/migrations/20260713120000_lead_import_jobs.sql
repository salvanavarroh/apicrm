-- ============================================================================
-- Jobs de importación de leads con IA en segundo plano. El commit dejó de ser
-- una server action bloqueante: se crea un job (pending), una route lo procesa
-- por tandas re-invocándose a sí misma, y el cliente hace polling del progreso.
-- Si el proceso se corta, el job queda con `updated_at` viejo → el cliente
-- ofrece "Reanudar" (sin cron). Ver docs/carga-leads-ia.md.
-- ============================================================================

create table if not exists public.lead_import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  file_path text not null,
  file_type text not null,
  mapping jsonb not null,
  context jsonb not null,
  status text not null default 'pending', -- pending | processing | done | error
  total integer not null default 0,
  processed integer not null default 0,
  inserted integer not null default 0,
  skipped_duplicates integer not null default 0,
  skipped_errors integer not null default 0,
  error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_import_jobs_company_idx
  on public.lead_import_jobs (company_id, created_at desc);
create index if not exists lead_import_jobs_active_idx
  on public.lead_import_jobs (status)
  where status in ('pending', 'processing');

alter table public.lead_import_jobs enable row level security;

-- Sólo lectura para el que lo creó y para admin/manager/supervisor de la empresa.
-- El insert/update lo hacen las server actions / la route con el admin client
-- (service role), así que no hacen falta policies de escritura.
drop policy if exists lead_import_jobs_select on public.lead_import_jobs;
create policy lead_import_jobs_select on public.lead_import_jobs
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (
      created_by = (select auth.uid())
      or (select public.current_role()) in ('admin', 'manager', 'supervisor')
    )
  );

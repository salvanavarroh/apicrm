-- ============================================================================
-- Reportes de problemas desde el asistente.
--
-- El asistente ya sabía derivar una incidencia ("el PDF no anda") a soporte con
-- un mail. Eso pone la carga en el usuario: tiene que abrir el correo, acordarse
-- de en qué pantalla estaba y describirlo de nuevo. La mitad de los reportes se
-- pierde ahí.
--
-- Con esto el reporte se hace DESDE la conversación y el contexto lo captura el
-- sistema: la ruta, el rol, la empresa y el hilo donde venía la charla. Lo que
-- el usuario escribe es sólo qué pasó y qué esperaba.
--
-- No es lo mismo que `assistant_gaps`: un hueco es una pregunta que falta
-- documentar, un reporte es algo que está roto. Se resuelven distinto y los mira
-- gente distinta.
-- ============================================================================

create type public.assistant_report_status as enum (
  'abierto',
  'en_curso',
  'resuelto',
  'descartado'
);

create table public.assistant_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  role public.user_role,

  -- Lo que escribe la persona. `expected` es opcional a propósito: pedir dos
  -- campos obligatorios hace que no se reporte nada.
  what_happened text not null check (length(btrim(what_happened)) >= 10),
  expected text,

  -- Contexto capturado solo. Es la diferencia entre un reporte accionable y un
  -- "no anda".
  route text,
  user_agent text,
  thread_id uuid references public.assistant_threads(id) on delete set null,

  status public.assistant_report_status not null default 'abierto',
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_reports_status_idx
  on public.assistant_reports (status, created_at desc);
create index assistant_reports_company_idx
  on public.assistant_reports (company_id, created_at desc);

create trigger assistant_reports_updated_at
  before update on public.assistant_reports
  for each row execute function public.set_updated_at();

alter table public.assistant_reports enable row level security;

-- Cada uno reporta a su nombre y ve lo que reportó. Nadie puede insertar un
-- reporte a nombre de otro.
create policy "assistant_reports_insert_own"
  on public.assistant_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "assistant_reports_select_own"
  on public.assistant_reports for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Soporte ve y gestiona todos: es quien los resuelve.
create policy "assistant_reports_super_admin"
  on public.assistant_reports for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.assistant_reports is
  'Problemas reportados desde el asistente. Distinto de assistant_gaps: acá algo está roto, allá falta documentación.';

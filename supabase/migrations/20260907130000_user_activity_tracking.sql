-- ============================================================================
-- Tiempo y actividad de los vendedores DENTRO del CRM.
--
-- Pedido de gerencia: "cuánto tiempo estuvieron mis vendedores en el CRM".
-- Hasta hoy el sistema sabía qué HICIERON (notas, tareas, visitas, ventas) pero
-- no CUÁNDO ni por cuánto tiempo estuvieron: no hay logins ni sesiones, la
-- sesión de Supabase se renueva sola y no dice nada sobre presencia.
--
-- Cómo se mide
-- ------------
-- El cliente late cada 60 s mientras (a) la pestaña está visible y (b) hubo
-- interacción del usuario en los últimos 5 minutos. Cada latido cae en un
-- "bucket" de 5 minutos calculado EN EL SERVIDOR (nunca con el reloj del
-- cliente, que es del usuario y es editable) y suma un ping a ese bucket.
--
--   minutos del bucket = least(pings, 5)
--
-- O sea: los minutos se cuentan por latido, no por bucket entero. Alguien que
-- entró 40 segundos suma 1 minuto, no 5. Y el `least` acota los latidos extra
-- que dispara volver a la pestaña.
--
-- Las dos condiciones del latido son lo que hace que el número signifique algo:
-- una pestaña olvidada abierta en segundo plano no acumula tiempo. Lo que mide
-- es "CRM en pantalla y la persona haciendo algo", que es lo que gerencia
-- quiere saber; no es un reloj de fichada y la sección lo dice.
--
-- Volumen: una jornada de 8 h son ~96 filas por persona. 20 vendedores por 22
-- días hábiles ≈ 42k filas/mes. Las consultas agregan por índice.
-- ============================================================================

create table if not exists public.user_activity_buckets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Múltiplo exacto de 5 minutos, en UTC. Lo calcula el servidor.
  bucket_start timestamptz not null,
  -- Última sección vista dentro del bucket (Inbox, Leads, …). Es una
  -- aproximación a propósito: si cambió de pantalla a mitad del bucket, gana la
  -- última. Para "dónde pasa el tiempo" alcanza y evita una fila por pantalla.
  section text,
  pings integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, bucket_start)
);

create index if not exists user_activity_company_idx
  on public.user_activity_buckets (company_id, bucket_start desc);
create index if not exists user_activity_user_idx
  on public.user_activity_buckets (user_id, bucket_start desc);

alter table public.user_activity_buckets enable row level security;

-- ---------- Quién puede LEER la actividad de quién ----------
-- No hay policies de INSERT/UPDATE: escribir pasa sólo por `track_user_activity`
-- (security definer), que siempre escribe la fila del usuario autenticado. Así
-- nadie puede inflar ni borrar el tiempo de nadie, ni el propio.

drop policy if exists uab_select_self on public.user_activity_buckets;
create policy uab_select_self on public.user_activity_buckets
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists uab_select_admin on public.user_activity_buckets;
create policy uab_select_admin on public.user_activity_buckets
  for select to authenticated
  using (
    (select public.current_role()) = 'admin'::public.user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists uab_select_manager on public.user_activity_buckets;
create policy uab_select_manager on public.user_activity_buckets
  for select to authenticated
  using (
    (select public.current_role()) in
      ('manager'::public.user_role, 'supervisor'::public.user_role)
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.profiles p
      where p.id = user_activity_buckets.user_id
        and p.manager_id = (select public.acting_manager_id())
    )
  );

drop policy if exists uab_select_super_admin on public.user_activity_buckets;
create policy uab_select_super_admin on public.user_activity_buckets
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------- Latido ----------
create or replace function public.track_user_activity(p_section text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  -- Bucket de 5 minutos con el reloj del servidor.
  v_bucket timestamptz := to_timestamp(
    (floor(extract(epoch from now()) / 300) * 300)::double precision
  );
begin
  if v_user is null then
    return;
  end if;
  select company_id into v_company from public.profiles where id = v_user;
  if v_company is null then
    return;
  end if;

  insert into public.user_activity_buckets as b
    (user_id, company_id, bucket_start, section, pings)
  values (v_user, v_company, v_bucket, p_section, 1)
  on conflict (user_id, bucket_start) do update
    set pings = b.pings + 1,
        section = coalesce(excluded.section, b.section),
        last_seen_at = now();
end;
$$;

grant execute on function public.track_user_activity(text) to authenticated;

-- ---------- Agregados ----------
-- `security invoker` (el default) a propósito: la RLS de arriba ya decide qué
-- filas ve cada rol, así que estas funciones no tienen que repetir el scope.
--
-- Todas AGREGAN en la base y devuelven poco. No es una preferencia de estilo:
-- PostgREST corta la respuesta en 1000 filas, así que una función que
-- devolviera "una fila por vendedor y por día" empezaría a mentir en silencio
-- con 20 vendedores y 3 meses de rango. Acá cada función tiene una cota que se
-- puede escribir: por vendedor, por día, por hora.
--
-- `p_user_ids` no es la seguridad (eso es la RLS): es el recorte al equipo que
-- se está mirando, para que el total del gerente no incluya los buckets de
-- gente que igual podría ver. En null no filtra.
--
-- El timezone entra por parámetro porque el "día" es el de la concesionaria
-- (companies.inbox_tz), no el del servidor, que corre en UTC.

-- Un renglón por vendedor: lo que alimenta la tabla del equipo.
create or replace function public.activity_user_totals(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'America/Argentina/Buenos_Aires',
  p_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  minutes integer,
  active_days integer,
  start_avg_minutes integer,
  last_at timestamptz
)
language sql
stable
as $$
  with per_day as (
    select
      b.user_id as uid,
      (b.bucket_start at time zone p_tz)::date as day,
      sum(least(b.pings, 5))::int as minutes,
      min(b.first_seen_at) as first_at,
      max(b.last_seen_at) as last_at
    from public.user_activity_buckets b
    where b.bucket_start >= p_from
      and b.bucket_start <= p_to
      and (p_user_ids is null or b.user_id = any(p_user_ids))
    group by b.user_id, (b.bucket_start at time zone p_tz)::date
  )
  select
    d.uid,
    sum(d.minutes)::int,
    count(*)::int,
    round(avg(
      extract(hour from (d.first_at at time zone p_tz)) * 60
      + extract(minute from (d.first_at at time zone p_tz))
    ))::int,
    max(d.last_at)
  from per_day d
  group by d.uid;
$$;

grant execute on function public.activity_user_totals(
  timestamptz, timestamptz, text, uuid[]
) to authenticated;

-- Un renglón por día: el gráfico de horas del equipo.
create or replace function public.activity_by_day(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'America/Argentina/Buenos_Aires',
  p_user_ids uuid[] default null
)
returns table (day date, minutes integer)
language sql
stable
as $$
  select
    (b.bucket_start at time zone p_tz)::date,
    sum(least(b.pings, 5))::int
  from public.user_activity_buckets b
  where b.bucket_start >= p_from
    and b.bucket_start <= p_to
    and (p_user_ids is null or b.user_id = any(p_user_ids))
  group by (b.bucket_start at time zone p_tz)::date;
$$;

grant execute on function public.activity_by_day(
  timestamptz, timestamptz, text, uuid[]
) to authenticated;

-- Un renglón por sección: "dónde pasan el tiempo".
create or replace function public.activity_by_section(
  p_from timestamptz,
  p_to timestamptz,
  p_user_ids uuid[] default null
)
returns table (section text, minutes integer)
language sql
stable
as $$
  select
    coalesce(b.section, 'other'),
    sum(least(b.pings, 5))::int
  from public.user_activity_buckets b
  where b.bucket_start >= p_from
    and b.bucket_start <= p_to
    and (p_user_ids is null or b.user_id = any(p_user_ids))
  group by coalesce(b.section, 'other');
$$;

grant execute on function public.activity_by_section(
  timestamptz, timestamptz, uuid[]
) to authenticated;

-- Un renglón por día de UN vendedor: la tabla del detalle. Acotado por el
-- rango, no por el tamaño del equipo.
create or replace function public.activity_user_days(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'America/Argentina/Buenos_Aires'
)
returns table (
  day date,
  minutes integer,
  first_at timestamptz,
  last_at timestamptz
)
language sql
stable
as $$
  select
    (b.bucket_start at time zone p_tz)::date,
    sum(least(b.pings, 5))::int,
    min(b.first_seen_at),
    max(b.last_seen_at)
  from public.user_activity_buckets b
  where b.user_id = p_user_id
    and b.bucket_start >= p_from
    and b.bucket_start <= p_to
  group by (b.bucket_start at time zone p_tz)::date;
$$;

grant execute on function public.activity_user_days(
  uuid, timestamptz, timestamptz, text
) to authenticated;

-- Distribución horaria de UN vendedor (máximo 24 renglones): a qué hora
-- trabaja de verdad, que es lo que responde si el turno declarado y el real son
-- el mismo.
create or replace function public.activity_user_hours(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'America/Argentina/Buenos_Aires'
)
returns table (hour_of_day integer, minutes integer)
language sql
stable
as $$
  select
    extract(hour from (b.bucket_start at time zone p_tz))::int,
    sum(least(b.pings, 5))::int
  from public.user_activity_buckets b
  where b.user_id = p_user_id
    and b.bucket_start >= p_from
    and b.bucket_start <= p_to
  group by extract(hour from (b.bucket_start at time zone p_tz))::int;
$$;

grant execute on function public.activity_user_hours(
  uuid, timestamptz, timestamptz, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Índices para el lado "qué hicieron" del informe.
--
-- Las dos mitades se consultan distinto: el tiempo tiene sus propios índices
-- arriba, pero las gestiones salen de tablas que nunca se habían filtrado así
-- (por empresa + ventana de fechas, sin pasar por un lead puntual). En
-- `messages` directamente no había ningún índice por empresa: el informe de un
-- trimestre iba a barrer la tabla entera.
-- ---------------------------------------------------------------------------

create index if not exists messages_company_outbound_idx
  on public.messages (company_id, created_at desc)
  where direction = 'outbound' and sent_by_user_id is not null;

create index if not exists lead_notes_company_created_idx
  on public.lead_notes (company_id, created_at desc);

create index if not exists lead_tasks_company_completed_idx
  on public.lead_tasks (company_id, completed_at desc)
  where completed_at is not null;

create index if not exists lead_tasks_company_due_open_idx
  on public.lead_tasks (company_id, due_date)
  where completed_at is null;

create index if not exists visits_company_scheduled_idx
  on public.visits (company_id, scheduled_at desc);

-- ============================================================================
-- Grupos de concesionarias (cliente multimarca) — Fase 1: la base y el candado.
--
-- Problema: un grupo automotor maneja 10+ marcas. Cada marca es una
-- concesionaria con sus sucursales, y no se le puede pedir al dueño que maneje
-- 10 cuentas distintas. Necesita UNA cuenta con acceso de Admin a todas.
--
-- ----------------------------------------------------------------------------
-- LA DECISIÓN DE DISEÑO QUE IMPORTA
-- ----------------------------------------------------------------------------
-- El camino obvio era reescribir las 283 policies de `company_id =
-- current_company_id()` a `company_id in (select ...)`. Se descartó: con
-- escritura habilitada, UNA policy que se escape no filtra datos, los corrompe,
-- y no hay forma de demostrar que no falta ninguna.
--
-- En cambio se aprovecha la indirección que ya existía. Las policies no leen
-- `profiles` directo: preguntan `current_company_id()` y `current_role()`. Si
-- esas dos funciones saben responder por un admin de grupo, NINGUNA policy
-- cambia:
--
--   · `current_company_id()` → para un admin de grupo devuelve la MARCA ACTIVA.
--   · `current_role()`       → para un admin de grupo devuelve 'admin'.
--
-- Es decir: un admin de grupo es un Admin de la marca que tiene seleccionada.
-- Ve una marca a la vez, igual que hoy, y cambia de marca con el selector. La
-- pantalla consolidada del grupo no pasa por RLS: se arma server-side con
-- service_role acotado a las concesionarias del grupo (mismo patrón que el
-- informe de ads).
--
-- El candado está DENTRO de `current_company_id()`: la marca activa se resuelve
-- con un join contra `companies.group_id`. Una marca de otro grupo no resuelve,
-- así que el peor caso de un estado manipulado es "no ve nada", nunca "ve otro
-- grupo". Por eso la marca activa vive en una tabla y no en una cookie: una
-- cookie la firma el cliente y Postgres no la puede validar.
--
-- Nota de compatibilidad: ninguna función de acá menciona el literal
-- 'group_admin'. Se decide por `profiles.group_id is not null`, que es un dato,
-- no un valor de enum: así el `alter type ... add value` no choca con el resto
-- de la migración (un valor nuevo de enum no se puede usar en la misma
-- transacción en que se agrega).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) El rol nuevo
-- ----------------------------------------------------------------------------
alter type public.user_role add value if not exists 'group_admin';

-- ----------------------------------------------------------------------------
-- 2) El grupo
--
-- El contrato es del GRUPO, no de cada marca: se acuerda un precio y se factura
-- a una sola persona. Las concesionarias del grupo no llevan precio propio, y
-- por eso el precio vive acá y no repartido en 10 filas de `companies`.
-- ----------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  cuit text,

  -- Contrato: personalizado por definición (un grupo de 10 marcas no entra en
  -- la lista de precios). El importe lo pone el SuperAdmin.
  monthly_price numeric(12, 2) not null default 0,
  billing_contact_name text,
  billing_email text,
  subscription_starts_at date,
  subscription_ends_at date,
  notes text,

  status public.company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

comment on table public.groups is
  'Grupo concesionario: varias marcas (companies) bajo un mismo dueño y un '
  'mismo contrato. El precio se acuerda por grupo y se factura a una persona.';

-- ----------------------------------------------------------------------------
-- 3) Enganches
-- ----------------------------------------------------------------------------
alter table public.companies
  add column group_id uuid references public.groups(id) on delete set null;
create index companies_group_idx on public.companies (group_id);

comment on column public.companies.group_id is
  'Grupo al que pertenece la marca. null = concesionaria independiente.';

alter table public.profiles
  add column group_id uuid references public.groups(id) on delete cascade;
create index profiles_group_idx on public.profiles (group_id);

-- Un profile es de una concesionaria O de un grupo, nunca de las dos. Sin esta
-- restricción `current_company_id()` tendría dos respuestas posibles para el
-- mismo usuario, que es exactamente el tipo de ambigüedad que termina en fuga.
alter table public.profiles
  add constraint profiles_company_xor_group
  check (company_id is null or group_id is null);

-- ----------------------------------------------------------------------------
-- 4) Marca activa del admin de grupo
--
-- Vive en la base y no en una cookie para que Postgres pueda validarla. El
-- candado real es el join contra companies.group_id en current_company_id().
-- ----------------------------------------------------------------------------
create table public.group_admin_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active_company_id uuid references public.companies(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger group_admin_state_set_updated_at
  before update on public.group_admin_state
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5) Helpers
-- ----------------------------------------------------------------------------

-- Grupo del usuario actual (null para todos los roles de una sola empresa).
create or replace function public.current_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.profiles where id = auth.uid()
$$;

-- ¿Esta concesionaria es de MI grupo? SECURITY DEFINER para no arrastrar las
-- policies de companies dentro de otra policy.
create or replace function public.company_in_my_group(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    join public.profiles p on p.id = auth.uid()
    where c.id = cid
      and c.group_id is not null
      and c.group_id = p.group_id
  )
$$;

-- Todas las concesionarias de mi grupo. La usa la pantalla consolidada.
create or replace function public.my_group_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.companies c
  join public.profiles p on p.id = auth.uid()
  where c.group_id is not null
    and c.group_id = p.group_id
$$;

-- ----------------------------------------------------------------------------
-- 6) Las dos funciones que hacen que no haya que tocar ninguna policy
-- ----------------------------------------------------------------------------

-- Empresa del usuario. Para un admin de grupo: la marca ACTIVA, y sólo si esa
-- marca pertenece a su grupo (el join es el candado). Si no eligió marca todavía
-- devuelve null, y null no matchea ninguna policy: el default es no ver nada.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.company_id is not null then p.company_id
    when p.group_id is not null then (
      select s.active_company_id
      from public.group_admin_state s
      join public.companies c
        on c.id = s.active_company_id
       and c.group_id = p.group_id
      where s.user_id = p.id
    )
  end
  from public.profiles p
  where p.id = auth.uid()
$$;

-- Rol EFECTIVO. Un admin de grupo es Admin dentro de la marca activa: así las
-- policies de admin, que ya están escritas y auditadas, valen tal cual.
-- Mismo patrón que `acting_manager_id()` para el supervisor.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.group_id is not null then 'admin'::public.user_role
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- 7) RLS de las tablas nuevas
-- ----------------------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_admin_state enable row level security;

-- El grupo lo administra el SuperAdmin (es un contrato comercial). El admin de
-- grupo sólo lee el suyo.
create policy "groups_select_super_admin"
  on public.groups for select to authenticated
  using ((select public.is_super_admin()));

create policy "groups_select_own"
  on public.groups for select to authenticated
  using (id = (select public.current_group_id()));

create policy "groups_write_super_admin"
  on public.groups for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- El admin de grupo tiene que poder LISTAR las marcas de su grupo para el
-- selector, no sólo la activa (que es lo único que devuelve
-- `companies_select_own`).
create policy "companies_select_group"
  on public.companies for select to authenticated
  using (
    group_id is not null
    and group_id = (select public.current_group_id())
  );

-- Cambiar de marca: sólo su propia fila, y sólo a una marca de su grupo. Este
-- with check es el segundo candado (el primero está en current_company_id).
create policy "group_admin_state_own"
  on public.group_admin_state for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      active_company_id is null
      or (select public.company_in_my_group(active_company_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 8) El precio de una marca de grupo no se factura aparte
-- ----------------------------------------------------------------------------
comment on column public.companies.monthly_price is
  'Importe facturado a ESTA concesionaria. Si pertenece a un grupo el contrato '
  'es del grupo (groups.monthly_price) y acá va 0.';

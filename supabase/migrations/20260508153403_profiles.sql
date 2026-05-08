-- Sprint 1 — tabla profiles (PRD §3 + §6.8)
-- Extiende auth.users con datos del CRM (rol, empresa, datos personales).
-- 1:1 con auth.users (id compartido). El email vive en auth.users.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  company_id uuid references public.companies(id) on delete restrict,
  role public.user_role not null,

  first_name text not null default '',
  last_name text not null default '',
  phone text,

  status public.profile_status not null default 'pending',
  -- Cuándo aceptó T&C y seteó password (PRD §6.1: pending → active)
  terms_accepted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- SuperAdmin no pertenece a empresa; el resto sí.
  constraint profiles_super_admin_no_company
    check (
      (role = 'super_admin' and company_id is null)
      or (role <> 'super_admin' and company_id is not null)
    )
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_company_id_idx on public.profiles (company_id);
create index profiles_role_idx on public.profiles (role);
create index profiles_status_idx on public.profiles (status);

alter table public.profiles enable row level security;

-- ============================================================================
-- Trigger: cuando auth.users inserta un user (sea por signUp o por invite),
-- creamos su profile automáticamente. Lee el raw_user_meta_data que viene
-- del payload del invite/signup:
--   { role: 'admin'|'manager'|..., company_id: '...', first_name, last_name }
-- Si no hay role en metadata, no creamos profile (caso del SuperAdmin
-- bootstrap, que se asigna después por la migration de seed).
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role public.user_role;
  meta_company_id uuid;
begin
  -- Si no vino role en metadata, salimos: el profile lo crea otra path
  -- (seed migration o un INSERT manual desde server action).
  if new.raw_user_meta_data ->> 'role' is null then
    return new;
  end if;

  begin
    meta_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
  exception when invalid_text_representation then
    raise warning 'profiles trigger: role inválido en raw_user_meta_data: %',
      new.raw_user_meta_data ->> 'role';
    return new;
  end;

  meta_company_id := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;

  insert into public.profiles (id, company_id, role, first_name, last_name)
  values (
    new.id,
    meta_company_id,
    meta_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on table public.profiles is
  'Datos del CRM por usuario. 1:1 con auth.users.';
comment on constraint profiles_super_admin_no_company on public.profiles is
  'SuperAdmin es rol de plataforma — no pertenece a empresa.';

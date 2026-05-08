-- Sprint 1 — RLS policies + helpers de sesión
-- "Auditoría de aislamiento es criterio de done del Sprint 1" (PRD §7).

-- ============================================================================
-- Helpers de sesión: leen el profile del auth.uid() actual.
-- SECURITY DEFINER porque evaluan profiles desde dentro de policies de otras
-- tablas, donde necesitamos saltar RLS para resolver el rol/empresa del user.
-- ============================================================================

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- ============================================================================
-- companies: RLS
-- ============================================================================

-- SELECT: SuperAdmin todo, demás roles solo su empresa
create policy "companies_select_super_admin"
  on public.companies for select to authenticated
  using (public.is_super_admin());

create policy "companies_select_own"
  on public.companies for select to authenticated
  using (id = public.current_company_id());

-- INSERT: solo SuperAdmin
create policy "companies_insert_super_admin"
  on public.companies for insert to authenticated
  with check (public.is_super_admin());

-- UPDATE: SuperAdmin cualquier empresa, Admin solo la suya.
-- Nota: la restricción de campos legales (legal_name, cuit) la enforce un
-- trigger BEFORE UPDATE más abajo, no RLS (Postgres RLS no es column-level).
create policy "companies_update_super_admin"
  on public.companies for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "companies_update_admin_own"
  on public.companies for update to authenticated
  using (
    public.current_role() = 'admin'
    and id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and id = public.current_company_id()
  );

-- DELETE: nadie. Soft-delete via status (PRD §6.2).

-- Trigger: campos legales solo modificables por SuperAdmin.
create or replace function public.companies_protect_legal_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if new.legal_name is distinct from old.legal_name
     or new.cuit is distinct from old.cuit then
    raise exception
      'Solo el SuperAdmin puede modificar legal_name o cuit (PRD §4)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger companies_protect_legal
  before update on public.companies
  for each row execute function public.companies_protect_legal_fields();

-- ============================================================================
-- profiles: RLS
-- ============================================================================

-- SELECT
create policy "profiles_select_super_admin"
  on public.profiles for select to authenticated
  using (public.is_super_admin());

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles_select_same_company"
  on public.profiles for select to authenticated
  using (
    company_id is not null
    and company_id = public.current_company_id()
  );

-- INSERT: nadie directamente vía API. Los inserts pasan por:
--   - el trigger on_auth_user_created (que corre como SECURITY DEFINER)
--   - service_role en server actions (createCompanyWithAdmin, seed SuperAdmin)
-- No agregamos policy de INSERT — sin policy = denegado.

-- UPDATE
-- SuperAdmin: todo
create policy "profiles_update_super_admin"
  on public.profiles for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- User edita SU propio profile (datos personales, no role/status/company_id —
-- esos los protege un trigger más abajo).
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin edita profiles de su empresa (sin escalar a super_admin — protegido
-- por trigger).
create policy "profiles_update_admin_same_company"
  on public.profiles for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id is not null
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id is not null
    and company_id = public.current_company_id()
  );

-- Trigger: campos sensibles (role, status, company_id) tienen reglas estrictas.
create or replace function public.profiles_protect_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SuperAdmin puede todo.
  if public.is_super_admin() then
    return new;
  end if;

  -- Self-edit: no puede cambiar role, status ni company_id.
  if new.id = auth.uid() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.company_id is distinct from old.company_id then
      raise exception
        'No podés modificar role/status/company_id en tu propio perfil'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Admin editando un profile de su empresa: no puede crear super_admins ni
  -- migrar profiles a otra empresa.
  if public.current_role() = 'admin' then
    if new.role = 'super_admin' or old.role = 'super_admin' then
      raise exception
        'Solo el SuperAdmin puede asignar/modificar el rol super_admin'
        using errcode = '42501';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception
        'No podés mover un usuario a otra empresa'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_sensitive
  before update on public.profiles
  for each row execute function public.profiles_protect_sensitive_fields();

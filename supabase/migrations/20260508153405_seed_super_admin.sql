-- Sprint 1 — bootstrap del primer SuperAdmin.
-- El user en auth.users tiene que crearse manualmente (vía dashboard o
-- `supabase auth signup`) antes de correr esta migration. Si existe, le
-- asignamos rol super_admin en profiles. Si no, esta migration es no-op
-- (idempotente, podés rerunear cuando crees el user).
--
-- Para otros environments (staging/prod), cambiar el email hardcodeado de
-- abajo o reemplazar por una migration nueva. Mantener este archivo como
-- referencia del piloto.

do $$
declare
  super_admin_email constant text := 'hello@cambalache.studio';
  super_admin_id uuid;
begin
  select id into super_admin_id
  from auth.users
  where lower(email) = lower(super_admin_email)
  limit 1;

  if super_admin_id is null then
    raise notice
      'SuperAdmin bootstrap: user con email % todavía no existe en auth.users. '
      'Creá el user desde Supabase dashboard y rerunneá esta migration.',
      super_admin_email;
    return;
  end if;

  insert into public.profiles (id, role, status, terms_accepted_at)
  values (super_admin_id, 'super_admin', 'active', now())
  on conflict (id) do update
    set role = 'super_admin',
        status = 'active',
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, now());

  raise notice 'SuperAdmin bootstrapeado: % (id=%)',
    super_admin_email, super_admin_id;
end $$;

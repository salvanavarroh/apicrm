-- ============================================================================
-- El trigger que crea el profile al invitar un usuario tiene que entender
-- `group_id`.
--
-- Antes sólo leía `company_id` del metadata del invite. Para un admin de grupo
-- eso deja `company_id` null y `group_id` null, y la restricción
-- `profiles_membership` lo rechaza: la invitación fallaba con el usuario ya
-- creado en auth.users.
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
  meta_group_id uuid;
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
  meta_group_id := nullif(new.raw_user_meta_data ->> 'group_id', '')::uuid;

  insert into public.profiles (id, company_id, group_id, role, first_name, last_name)
  values (
    new.id,
    meta_company_id,
    meta_group_id,
    meta_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

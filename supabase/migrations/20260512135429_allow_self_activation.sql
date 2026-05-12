-- Sprint 1 — fix: el user invitado tiene que poder activar su propio profile
-- (pending → active) al completar /auth/accept-invitation. El trigger
-- previo bloqueaba cualquier cambio de status en self-edit.

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

  -- Self-edit
  if new.id = auth.uid() then
    if new.role is distinct from old.role
       or new.company_id is distinct from old.company_id then
      raise exception
        'No podés modificar role ni company_id en tu propio perfil'
        using errcode = '42501';
    end if;

    -- status solo puede pasar de pending → active (aceptar invitación).
    -- Cualquier otro cambio de status lo hace un superior.
    if new.status is distinct from old.status
       and not (old.status = 'pending' and new.status = 'active') then
      raise exception
        'Solo podés activar tu cuenta una vez (pending → active)'
        using errcode = '42501';
    end if;

    return new;
  end if;

  -- Admin editando profiles de su empresa
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

-- ============================================================================
-- Fix: el SuperAdmin no podía modificar legal_name / cuit de una concesionaria
-- desde el panel. La server action corre con el service_role (admin client), que
-- no tiene JWT → `is_super_admin()` (mira auth.uid()) devuelve false → el trigger
-- companies_protect_legal_fields bloqueaba el update.
--
-- El service_role es código de servidor confiable (solo lo usa el SuperAdmin vía
-- `updateCompanyAsSuperAdmin`, que ya valida el rol). Permitimos que el trigger
-- deje pasar cuando el actor es service_role.
-- ============================================================================

create or replace function public.companies_protect_legal_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SuperAdmin autenticado, o service_role (server action del SuperAdmin).
  if public.is_super_admin() or auth.role() = 'service_role' then
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

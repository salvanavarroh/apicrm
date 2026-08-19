-- ============================================================================
-- Pertenencia del profile, con el rol de grupo incluido.
--
-- `profiles_super_admin_no_company` exigía company_id NOT NULL para todo rol que
-- no fuera super_admin. El admin de grupo no pertenece a una concesionaria sino a
-- un grupo, así que la restricción lo rechazaba (lo encontró el test de
-- aislamiento al intentar crear el primero).
--
-- Queda una sola regla, con los tres casos posibles y sin huecos:
--   · super_admin  → ni empresa ni grupo (rol de plataforma)
--   · group_admin  → grupo, nunca empresa
--   · el resto     → empresa, nunca grupo
--
-- Reemplaza también a `profiles_company_xor_group`, que decía "no las dos" pero
-- permitía "ninguna de las dos".
-- ============================================================================

alter table public.profiles
  drop constraint if exists profiles_super_admin_no_company;
alter table public.profiles
  drop constraint if exists profiles_company_xor_group;

alter table public.profiles
  add constraint profiles_membership
  check (
    case role
      when 'super_admin' then company_id is null and group_id is null
      when 'group_admin' then company_id is null and group_id is not null
      else company_id is not null and group_id is null
    end
  );

comment on constraint profiles_membership on public.profiles is
  'A qué pertenece cada rol: super_admin a nada (plataforma), group_admin a un '
  'grupo, el resto a una concesionaria. Exactamente una, nunca ambas ni ninguna.';

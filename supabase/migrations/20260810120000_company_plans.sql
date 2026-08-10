-- ============================================================================
-- Planes de suscripción por concesionaria.
--
-- Hasta ahora el precio era un número libre (`companies.monthly_price`) que el
-- SuperAdmin tipeaba a mano en cada alta. Eso funcionó en el piloto pero no
-- escala: no hay forma de saber "qué plan tiene" una cuenta, ni de cambiar el
-- precio de lista sin editar empresa por empresa.
--
-- Este cambio agrega el CONCEPTO de plan. El precio de referencia de cada plan
-- vive en código (`src/lib/plans.ts`) —así se cambia sin migración— y
-- `monthly_price` sigue siendo el importe efectivamente facturado a esa cuenta,
-- que puede diferir del de lista (descuentos, cuentas legacy, acuerdos).
--
-- `inicial` existe para poder etiquetar correctamente a las cuentas que
-- quedaron con el precio viejo; no se ofrece para altas nuevas.
-- ============================================================================

create type public.company_plan as enum (
  'inicial',       -- Precio legacy del piloto
  'estandar',      -- Plan de lista actual
  'personalizado'  -- Acuerdo particular: el precio lo pone el SuperAdmin
);

alter table public.companies
  add column plan public.company_plan;

comment on column public.companies.plan is
  'Plan de suscripción. El precio de lista vive en src/lib/plans.ts; '
  'monthly_price es el importe realmente facturado a esta cuenta.';

-- Índice para el panel del SuperAdmin (filtrar/agrupar por plan).
create index companies_plan_idx on public.companies (plan);

-- ----------------------------------------------------------------------------
-- SIN backfill, a propósito.
--
-- La tentación es clasificar por precio (<=100 → inicial, <=200 → estandar…),
-- pero `monthly_price` está cargado en PESOS (los valores actuales van de 0 a
-- 1.000.000) mientras los precios de lista se definieron en USD. Cualquier
-- umbral que se elija inventa una clasificación que después nadie puede
-- justificar, y el plan es un dato comercial: es mejor un NULL honesto que un
-- valor plausible y falso.
--
-- Las cuentas arrancan sin plan y el SuperAdmin lo asigna desde el panel
-- (queda visible como "Sin plan" en el listado de Concesionarias).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- El plan es un dato comercial: sólo el SuperAdmin (o el service_role de sus
-- server actions) lo puede tocar. Se reusa el trigger que ya protege
-- legal_name/cuit para no multiplicar triggers sobre la misma tabla.
-- ----------------------------------------------------------------------------
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

  if new.plan is distinct from old.plan
     or new.monthly_price is distinct from old.monthly_price then
    raise exception
      'Solo el SuperAdmin puede modificar el plan o el precio de la cuenta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

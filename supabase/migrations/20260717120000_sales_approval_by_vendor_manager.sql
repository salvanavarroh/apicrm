-- ============================================================================
-- Fix aprobación de ventas: el gerente/supervisor que ve y aprueba una venta es
-- el JEFE DEL VENDEDOR (profiles.manager_id), no el dueño de la gerencia
-- (branch × tipo de producto) del lead.
--
-- Motivo: un lead puede tener una combinación sucursal+tipo que no mapea a
-- ninguna gerencia (o mapea a otro gerente), y entonces el vendedor quedaba
-- "huérfano": su gerente no veía la venta ni recibía la notificación, aunque el
-- vendedor sí reporta a ese gerente. La relación vendedor→gerente siempre existe
-- y es la jerarquía real de aprobación.
--
-- Todas las funciones de RLS van envueltas en (select ...) por rendimiento.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SELECT: el gerente ve las ventas de SUS vendedores (los que le reportan).
-- ----------------------------------------------------------------------------
drop policy if exists sales_select_manager on public.sales;
create policy sales_select_manager on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.profiles v
      where v.id = sales.vendor_id
        and v.manager_id = (select auth.uid())
    )
  );

drop policy if exists sales_select_supervisor on public.sales;
create policy sales_select_supervisor on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.profiles v
      where v.id = sales.vendor_id
        and v.manager_id = (select public.acting_manager_id())
    )
  );

-- ----------------------------------------------------------------------------
-- UPDATE (aprobar / rechazar): mismo alcance que el SELECT.
-- ----------------------------------------------------------------------------
drop policy if exists sales_update_manager on public.sales;
create policy sales_update_manager on public.sales
  for update to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.profiles v
      where v.id = sales.vendor_id
        and v.manager_id = (select auth.uid())
    )
  )
  with check (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists sales_update_supervisor on public.sales;
create policy sales_update_supervisor on public.sales
  for update to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.profiles v
      where v.id = sales.vendor_id
        and v.manager_id = (select public.acting_manager_id())
    )
  )
  with check (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
  );

-- ----------------------------------------------------------------------------
-- Config de presupuesto: ocultar el nombre de la empresa cuando el logo ya lo
-- incluye (ej. concesionarias cuyo logo ES el nombre).
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists quote_hide_name boolean not null default false;

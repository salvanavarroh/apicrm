-- Sprint 2 — RLS policies para tablas operativas (PRD §6.5-§6.7 + §6.3)
-- Patrón: SuperAdmin todo + scope por company_id para roles operativos.

-- ============================================================================
-- branches
-- ============================================================================

-- SELECT: SuperAdmin todo, demás roles solo su empresa.
create policy "branches_select_super_admin"
  on public.branches for select to authenticated
  using (public.is_super_admin());

create policy "branches_select_same_company"
  on public.branches for select to authenticated
  using (company_id = public.current_company_id());

-- INSERT/UPDATE: Admin de la empresa (PRD §6.6).
create policy "branches_insert_admin"
  on public.branches for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "branches_update_admin"
  on public.branches for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- DELETE: solo Admin de la empresa (PRD §6.6 — "solicitud de baja se notifica
-- al SuperAdmin", interpretación pragmática: el Admin puede borrar sucursales
-- nuevas no usadas; las que tienen historial requieren intervención).
create policy "branches_delete_admin"
  on public.branches for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- product_types
-- ============================================================================

create policy "product_types_select_super_admin"
  on public.product_types for select to authenticated
  using (public.is_super_admin());

create policy "product_types_select_same_company"
  on public.product_types for select to authenticated
  using (company_id = public.current_company_id());

create policy "product_types_insert_admin"
  on public.product_types for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "product_types_update_admin"
  on public.product_types for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "product_types_delete_admin"
  on public.product_types for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- branch_product_types (relación M:N — chequeo a través de branch)
-- ============================================================================

create policy "bpt_select_super_admin"
  on public.branch_product_types for select to authenticated
  using (public.is_super_admin());

create policy "bpt_select_same_company"
  on public.branch_product_types for select to authenticated
  using (
    exists(
      select 1 from public.branches b
      where b.id = branch_id
        and b.company_id = public.current_company_id()
    )
  );

create policy "bpt_write_admin"
  on public.branch_product_types for all to authenticated
  using (
    public.current_role() = 'admin'
    and exists(
      select 1 from public.branches b
      where b.id = branch_id
        and b.company_id = public.current_company_id()
    )
  )
  with check (
    public.current_role() = 'admin'
    and exists(
      select 1 from public.branches b
      where b.id = branch_id
        and b.company_id = public.current_company_id()
    )
  );

-- ============================================================================
-- campaigns
-- ============================================================================

create policy "campaigns_select_super_admin"
  on public.campaigns for select to authenticated
  using (public.is_super_admin());

create policy "campaigns_select_same_company"
  on public.campaigns for select to authenticated
  using (company_id = public.current_company_id());

create policy "campaigns_insert_admin"
  on public.campaigns for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "campaigns_update_admin"
  on public.campaigns for update to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "campaigns_delete_admin"
  on public.campaigns for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- ============================================================================
-- subscription_payments
-- ============================================================================

-- SuperAdmin: todo (genera + marca como pagado).
-- Admin: solo lectura de los pagos de su empresa (para ver banner morosidad
-- en detalle).
-- Otros roles: solo necesitan saber si HAY morosidad (via has_overdue_payment),
-- no detalle. SELECT igual lo damos a same_company porque la function
-- security definer ya lo encapsula, pero RLS también puede leer (no es info
-- sensible).

create policy "payments_select_super_admin"
  on public.subscription_payments for select to authenticated
  using (public.is_super_admin());

create policy "payments_select_same_company"
  on public.subscription_payments for select to authenticated
  using (company_id = public.current_company_id());

create policy "payments_insert_super_admin"
  on public.subscription_payments for insert to authenticated
  with check (public.is_super_admin());

create policy "payments_update_super_admin"
  on public.subscription_payments for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- DELETE: nadie. Audit trail.

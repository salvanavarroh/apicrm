-- ============================================================================
-- Perf de RLS en `leads` (la tabla con miles de filas).
--
-- Las policies llamaban a current_role() / current_company_id() / auth.uid() /
-- acting_manager_id() / is_super_admin() SIN envolver → Postgres las evalúa POR
-- FILA (cada una hace un SELECT sobre profiles). Con ~2600 leads eso daba
-- ~830ms por columna del kanban (y 9 columnas), y timeouts en el detalle.
--
-- Fix canónico de Supabase: envolver cada función en (select ...). Así se
-- evalúan UNA vez (InitPlan) y el planner puede usar los índices de gerencia.
-- Medido: 833ms → 7.6ms (~110x). Semántica idéntica; sólo cambia el rendimiento.
-- ============================================================================

-- ---------- SELECT ----------
drop policy if exists leads_select_admin on public.leads;
create policy leads_select_admin on public.leads for select to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_select_manager on public.leads;
create policy leads_select_manager on public.leads for select to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.managements m
      where m.manager_id = (select auth.uid())
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  );

drop policy if exists leads_select_supervisor on public.leads;
create policy leads_select_supervisor on public.leads for select to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.managements m
      where m.manager_id = (select public.acting_manager_id())
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  );

drop policy if exists leads_select_sales on public.leads;
create policy leads_select_sales on public.leads for select to authenticated
  using (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and assigned_user_id = (select auth.uid())
  );

drop policy if exists leads_select_provider on public.leads;
create policy leads_select_provider on public.leads for select to authenticated
  using (
    (select public.current_role()) = 'data_provider'::user_role
    and company_id = (select public.current_company_id())
    and created_by = (select auth.uid())
  );

drop policy if exists leads_select_super_admin on public.leads;
create policy leads_select_super_admin on public.leads for select to authenticated
  using ((select public.is_super_admin()));

-- ---------- INSERT ----------
drop policy if exists leads_insert_admin on public.leads;
create policy leads_insert_admin on public.leads for insert to authenticated
  with check (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_insert_manager on public.leads;
create policy leads_insert_manager on public.leads for insert to authenticated
  with check (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_insert_supervisor on public.leads;
create policy leads_insert_supervisor on public.leads for insert to authenticated
  with check (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_insert_provider on public.leads;
create policy leads_insert_provider on public.leads for insert to authenticated
  with check (
    (select public.current_role()) = 'data_provider'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_insert_sales on public.leads;
create policy leads_insert_sales on public.leads for insert to authenticated
  with check (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and assigned_user_id = (select auth.uid())
  );

-- ---------- UPDATE ----------
drop policy if exists leads_update_admin on public.leads;
create policy leads_update_admin on public.leads for update to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  )
  with check (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_update_manager on public.leads;
create policy leads_update_manager on public.leads for update to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.managements m
      where m.manager_id = (select auth.uid())
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  )
  with check (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_update_supervisor on public.leads;
create policy leads_update_supervisor on public.leads for update to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.managements m
      where m.manager_id = (select public.acting_manager_id())
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  )
  with check (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists leads_update_sales on public.leads;
create policy leads_update_sales on public.leads for update to authenticated
  using (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and assigned_user_id = (select auth.uid())
  )
  with check (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and assigned_user_id = (select auth.uid())
  );

drop policy if exists leads_update_provider on public.leads;
create policy leads_update_provider on public.leads for update to authenticated
  using (
    (select public.current_role()) = 'data_provider'::user_role
    and company_id = (select public.current_company_id())
    and created_by = (select auth.uid())
    and status = 'new'::lead_status
  )
  with check (
    (select public.current_role()) = 'data_provider'::user_role
    and company_id = (select public.current_company_id())
    and created_by = (select auth.uid())
  );

-- ---------- DELETE ----------
drop policy if exists leads_delete_admin on public.leads;
create policy leads_delete_admin on public.leads for delete to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

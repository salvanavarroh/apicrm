-- ============================================================================
-- Mismo fix de RLS (envolver funciones en (select ...)) para las tablas que
-- crecen con el volumen de leads y se consultan de forma amplia: sales, quotes,
-- lead_submissions. Evita la evaluación por-fila de current_role()/
-- current_company_id()/auth.uid()/acting_manager_id() cuando la sucursal tiene
-- miles de leads. Semántica idéntica.
--
-- Nota: lead_notes / lead_tasks / visits / lead_vehicles NO se tocan: sus
-- policies delegan en la RLS de `leads` (EXISTS sobre leads), que ya quedó
-- optimizada en 20260708120000.
-- ============================================================================

-- ---------------------------------------------------------------- sales
drop policy if exists sales_select_admin on public.sales;
create policy sales_select_admin on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists sales_select_manager on public.sales;
create policy sales_select_manager on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id and m.manager_id = (select auth.uid())
    )
  );

drop policy if exists sales_select_supervisor on public.sales;
create policy sales_select_supervisor on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id
        and m.manager_id = (select public.acting_manager_id())
    )
  );

drop policy if exists sales_select_sales on public.sales;
create policy sales_select_sales on public.sales for select to authenticated
  using (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
  );

drop policy if exists sales_select_super_admin on public.sales;
create policy sales_select_super_admin on public.sales for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists sales_insert_sales on public.sales;
create policy sales_insert_sales on public.sales for insert to authenticated
  with check (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = sales.lead_id
        and l.assigned_user_id = (select auth.uid())
        and l.status = 'quoted'::lead_status
    )
  );

drop policy if exists sales_update_admin on public.sales;
create policy sales_update_admin on public.sales for update to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  )
  with check (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

-- ---------------------------------------------------------------- quotes
drop policy if exists quotes_select_admin on public.quotes;
create policy quotes_select_admin on public.quotes for select to authenticated
  using (
    (select public.current_role()) = 'admin'::user_role
    and company_id = (select public.current_company_id())
  );

drop policy if exists quotes_select_manager on public.quotes;
create policy quotes_select_manager on public.quotes for select to authenticated
  using (
    (select public.current_role()) = 'manager'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = quotes.lead_id and m.manager_id = (select auth.uid())
    )
  );

drop policy if exists quotes_select_supervisor on public.quotes;
create policy quotes_select_supervisor on public.quotes for select to authenticated
  using (
    (select public.current_role()) = 'supervisor'::user_role
    and company_id = (select public.current_company_id())
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id and m.product_type_id = l.product_type_id
      where l.id = quotes.lead_id
        and m.manager_id = (select public.acting_manager_id())
    )
  );

drop policy if exists quotes_select_sales on public.quotes;
create policy quotes_select_sales on public.quotes for select to authenticated
  using (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
  );

drop policy if exists quotes_select_super_admin on public.quotes;
create policy quotes_select_super_admin on public.quotes for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists quotes_insert_sales on public.quotes;
create policy quotes_insert_sales on public.quotes for insert to authenticated
  with check (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = quotes.lead_id and l.assigned_user_id = (select auth.uid())
    )
  );

drop policy if exists quotes_update_sales on public.quotes;
create policy quotes_update_sales on public.quotes for update to authenticated
  using (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
  )
  with check (
    (select public.current_role()) = 'sales'::user_role
    and company_id = (select public.current_company_id())
    and vendor_id = (select auth.uid())
  );

-- ---------------------------------------------------- lead_submissions
drop policy if exists submissions_select_same_company on public.lead_submissions;
create policy submissions_select_same_company on public.lead_submissions
  for select to authenticated
  using (company_id = (select public.current_company_id()));

drop policy if exists submissions_select_super_admin on public.lead_submissions;
create policy submissions_select_super_admin on public.lead_submissions
  for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists submissions_insert_same_company on public.lead_submissions;
create policy submissions_insert_same_company on public.lead_submissions
  for insert to authenticated
  with check (company_id = (select public.current_company_id()));

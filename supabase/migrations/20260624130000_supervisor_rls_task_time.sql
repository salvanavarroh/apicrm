-- Sprint 15 — implementación que USA los enums creados en 20260624120000:
--   1) lead_tasks.due_time — horario opcional de la tarea.
--   2) acting_manager_id() — el gerente "efectivo" del usuario actual.
--   3) Policies del rol supervisor (espeja al gerente, scoped al gerente padre).
--   4) Permitir a managers crear/gestionar supervisores de su equipo.

-- ============================================================================
-- 1) Horario de tarea — opcional. due_date sigue siendo date (sin TZ).
--    El orden del mismo día se hace por (due_date, due_time).
-- ============================================================================

alter table public.lead_tasks
  add column if not exists due_time time;

-- ============================================================================
-- 2) acting_manager_id() — qué gerente "encarna" el usuario actual.
--    Gerente: su propio id. Supervisor: el id de su gerente padre (manager_id).
--    Cualquier otro rol: null. Se usa en las policies de supervisor para
--    reutilizar el scope por gerencias (managements) del gerente.
-- ============================================================================

create or replace function public.acting_manager_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() = 'manager' then auth.uid()
    when public.current_role() = 'supervisor' then
      (select manager_id from public.profiles where id = auth.uid())
    else null
  end
$$;

-- ============================================================================
-- 3) Policies del supervisor — espejo del gerente, pero scoped a las gerencias
--    de su gerente padre vía acting_manager_id(). Son ADITIVAS (las policies
--    se combinan con OR), no tocan las del gerente.
-- ============================================================================

-- ---- leads --------------------------------------------------------------
create policy "leads_select_supervisor"
  on public.leads for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  );

create policy "leads_insert_supervisor"
  on public.leads for insert to authenticated
  with check (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
  );

create policy "leads_update_supervisor"
  on public.leads for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = leads.branch_id
        and m.product_type_id = leads.product_type_id
    )
  )
  with check (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
  );

-- ---- lead_capture_forms --------------------------------------------------
create policy "forms_select_supervisor"
  on public.lead_capture_forms for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_insert_supervisor"
  on public.lead_capture_forms for insert to authenticated
  with check (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_update_supervisor"
  on public.lead_capture_forms for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  )
  with check (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

create policy "forms_delete_supervisor"
  on public.lead_capture_forms for delete to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.managements m
      where m.manager_id = public.acting_manager_id()
        and m.branch_id = lead_capture_forms.branch_id
        and m.product_type_id = lead_capture_forms.product_type_id
    )
  );

-- ---- quotes (lectura) ----------------------------------------------------
create policy "quotes_select_supervisor"
  on public.quotes for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id
       and m.product_type_id = l.product_type_id
      where l.id = quotes.lead_id and m.manager_id = public.acting_manager_id()
    )
  );

-- ---- sales (lectura) -----------------------------------------------------
create policy "sales_select_supervisor"
  on public.sales for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id = public.current_company_id()
    and exists (
      select 1 from public.leads l
      join public.managements m
        on m.branch_id = l.branch_id
       and m.product_type_id = l.product_type_id
      where l.id = sales.lead_id and m.manager_id = public.acting_manager_id()
    )
  );

-- ---- managements (lectura) ----------------------------------------------
-- El supervisor ve las gerencias de su gerente (para el dashboard/equipo).
-- managements_select_same_company ya cubre la lectura por empresa, así que
-- no hace falta una policy extra. (El toggle de auto-asignación sigue siendo
-- exclusivo del gerente dueño.)

-- ============================================================================
-- 4) profiles — el supervisor puede ver/editar a los vendedores de su equipo
--    (mismo alcance que el gerente sobre role='sales' de la empresa).
-- ============================================================================

create policy "profiles_update_supervisor_sales"
  on public.profiles for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and company_id is not null
    and company_id = public.current_company_id()
    and role = 'sales'
  )
  with check (
    public.current_role() = 'supervisor'
    and company_id is not null
    and company_id = public.current_company_id()
    and role = 'sales'
  );

-- user_product_types: el supervisor gestiona tipos de los vendedores igual
-- que el gerente. Reemplazamos la policy para incluir 'supervisor'.
drop policy if exists "upt_write_admin_manager" on public.user_product_types;
create policy "upt_write_admin_manager_supervisor"
  on public.user_product_types for all to authenticated
  using (
    public.current_role() in ('admin', 'manager', 'supervisor')
    and exists(
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = public.current_company_id()
    )
  )
  with check (
    public.current_role() in ('admin', 'manager', 'supervisor')
    and exists(
      select 1 from public.profiles p
      where p.id = user_id
        and p.company_id = public.current_company_id()
    )
  );

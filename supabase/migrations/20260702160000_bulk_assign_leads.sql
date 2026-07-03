-- ============================================================================
-- Asignación masiva balanceada para la carga de leads (round-robin).
--
-- Problema: la carga con IA llamaba a `auto_assign_lead` una vez por lead. Con
-- miles de leads eso era miles de round-trips (timeout de la función serverless)
-- y quedaba desbalanceado. Esta función asigna TODO el lote en UNA sentencia:
--   - toma branch/product del lote (el import es homogéneo por archivo),
--   - elige los vendedores elegibles (misma lógica que auto_assign_lead),
--   - reparte los leads round-robin ordenando por carga actual asc, de modo que
--     el menos cargado arranca primero → reparto parejo.
-- Devuelve la cantidad de leads asignados.
-- ============================================================================

create or replace function public.bulk_assign_leads(p_lead_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_management managements%rowtype;
  v_k integer;
  v_assigned integer := 0;
begin
  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    return 0;
  end if;

  -- Referencia de branch/product del lote (asumimos homogéneo por archivo).
  select * into v_lead
  from leads
  where id = any(p_lead_ids)
    and branch_id is not null
    and product_type_id is not null
  limit 1;
  if not found then
    return 0;
  end if;

  select * into v_management
  from managements
  where branch_id = v_lead.branch_id
    and product_type_id = v_lead.product_type_id;
  if not found or not v_management.auto_assignment_enabled then
    return 0;
  end if;

  -- Vendedores elegibles (misma condición que auto_assign_lead) + su carga.
  create temporary table _bulk_vendors on commit drop as
  select
    p.id,
    (
      select count(*)
      from leads l2
      where l2.assigned_user_id = p.id
        and l2.status in ('new', 'contacted', 'interested', 'quoted')
    ) as load,
    row_number() over (
      order by (
        select count(*)
        from leads l2
        where l2.assigned_user_id = p.id
          and l2.status in ('new', 'contacted', 'interested', 'quoted')
      ) asc, p.id
    ) as pos
  from profiles p
  join user_product_types upt
    on upt.user_id = p.id
   and upt.product_type_id = v_lead.product_type_id
  where p.company_id = v_lead.company_id
    and p.role = 'sales'
    and p.status = 'active'
    and p.manager_id = v_management.manager_id
    and p.branch_id = v_lead.branch_id;

  select count(*) into v_k from _bulk_vendors;
  if v_k = 0 then
    return 0;
  end if;

  with tgt as (
    select
      l.id as lead_id,
      (row_number() over (order by l.created_at, l.id) - 1) as seq
    from leads l
    where l.id = any(p_lead_ids)
      and l.assigned_user_id is null
      and l.company_id = v_lead.company_id
      and l.branch_id = v_lead.branch_id
      and l.product_type_id = v_lead.product_type_id
  )
  update leads L
  set assigned_user_id = v.id,
      assigned_at = now()
  from tgt
  join _bulk_vendors v on v.pos = (tgt.seq % v_k) + 1
  where L.id = tgt.lead_id;

  get diagnostics v_assigned = row_count;
  return v_assigned;
end;
$$;

grant execute on function public.bulk_assign_leads(uuid[]) to authenticated;

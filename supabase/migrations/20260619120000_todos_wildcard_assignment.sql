-- Fix: el tipo de producto "Todos" debe funcionar como comodín en la
-- asignación de leads. Un vendedor (o gerente) cuya cobertura es "Todos" tiene
-- que poder recibir leads de CUALQUIER tipo real (Convencional, Plan, etc.),
-- no solo de un lead cuyo tipo sea literalmente "Todos".
--
-- Antes, `auto_assign_lead` matcheaba `user_product_types.product_type_id` de
-- forma exacta contra el tipo del lead, por lo que un vendedor con solo "Todos"
-- quedaba excluido. (Pedido Salvador — bug #3.)

create or replace function public.auto_assign_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads%rowtype;
  v_enabled boolean;
  v_assignee uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found
     or v_lead.branch_id is null
     or v_lead.product_type_id is null
     or v_lead.assigned_user_id is not null then
    return null;
  end if;

  -- Auto-asignación activa si alguna gerencia de esta combinación la habilitó.
  select bool_or(auto_assignment_enabled) into v_enabled
  from managements
  where branch_id = v_lead.branch_id
    and product_type_id = v_lead.product_type_id;
  if v_enabled is not true then
    return null;
  end if;

  -- Pool: vendedores activos de todos los gerentes de la combinación, que
  -- cubran el tipo del lead **o** tengan cobertura "Todos" (comodín).
  select p.id into v_assignee
  from profiles p
  where p.company_id = v_lead.company_id
    and p.role = 'sales'
    and p.status = 'active'
    and p.branch_id = v_lead.branch_id
    and p.manager_id in (
      select m.manager_id from managements m
      where m.branch_id = v_lead.branch_id
        and m.product_type_id = v_lead.product_type_id
    )
    and exists (
      select 1 from user_product_types upt
      where upt.user_id = p.id
        and (
          upt.product_type_id = v_lead.product_type_id
          or upt.product_type_id in (
            select pt.id from product_types pt
            where pt.company_id = v_lead.company_id
              and pt.name = 'Todos'
          )
        )
    )
  order by (
    select count(*) from leads l2
    where l2.assigned_user_id = p.id
      and l2.status in ('new', 'contacted', 'interested', 'quoted')
  ) asc, random()
  limit 1;

  if v_assignee is null then
    return null;
  end if;

  update leads
  set assigned_user_id = v_assignee,
      assigned_at = now()
  where id = p_lead_id;

  return v_assignee;
end;
$$;

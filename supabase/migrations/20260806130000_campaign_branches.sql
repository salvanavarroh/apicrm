-- Una campaña puede repartir sus leads entre VARIAS sucursales (round-robin).
-- Tabla de relación campaña↔sucursal. `company_id` denormalizado para RLS igual
-- que en campaigns.

create table if not exists public.campaign_branches (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (campaign_id, branch_id)
);

create index if not exists campaign_branches_campaign_idx
  on public.campaign_branches (campaign_id);

-- Backfill: la sucursal única actual de cada campaña pasa a la relación.
insert into public.campaign_branches (campaign_id, branch_id, company_id)
select id, branch_id, company_id
from public.campaigns
where branch_id is not null
on conflict do nothing;

alter table public.campaign_branches enable row level security;

create policy "campaign_branches_select_super_admin"
  on public.campaign_branches for select to authenticated
  using (public.is_super_admin());

create policy "campaign_branches_select_same_company"
  on public.campaign_branches for select to authenticated
  using (company_id = public.current_company_id());

create policy "campaign_branches_insert_admin"
  on public.campaign_branches for insert to authenticated
  with check (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

create policy "campaign_branches_delete_admin"
  on public.campaign_branches for delete to authenticated
  using (
    public.current_role() = 'admin'
    and company_id = public.current_company_id()
  );

-- Round-robin por menor carga: entre las sucursales de la campaña, la que menos
-- leads tiene asignados para esa campaña. Determinístico (desempata por id).
create or replace function public.pick_campaign_branch(p_campaign_id uuid)
returns uuid
language sql
stable
as $$
  select cb.branch_id
  from public.campaign_branches cb
  left join public.leads l
    on l.campaign_id = p_campaign_id
   and l.branch_id = cb.branch_id
   and l.merged_into_id is null
  where cb.campaign_id = p_campaign_id
  group by cb.branch_id
  order by count(l.id) asc, cb.branch_id asc
  limit 1;
$$;
